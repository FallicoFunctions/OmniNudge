package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/helpers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	zlog "github.com/rs/zerolog/log"
)

// ─── HTML sanitization regexps ─────────────────────────────────────────────
// These strip the most dangerous HTML constructs from AI-generated content.
// The frontend additionally renders the result inside a sandboxed iframe.
var (
	reScriptBlock     = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reDangerousOpen   = regexp.MustCompile(`(?i)<(iframe|object|embed|form|input|select|textarea|link|meta|base|applet|frameset|frame|noscript|style\s+type\s*=\s*["']text/javascript["'])[^>]*>`)
	reDangerousClose  = regexp.MustCompile(`(?i)</(iframe|object|embed|form|select|textarea|applet|frameset|frame)>`)
	reOnEvent         = regexp.MustCompile(`(?i)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)`)
	reJavascriptURI   = regexp.MustCompile(`(?i)(href|src|action)\s*=\s*["']?\s*javascript:[^"'\s>]*["']?`)
	reDataURI         = regexp.MustCompile(`(?i)(src)\s*=\s*["']?\s*data:[^"'\s>]*["']?`)
)

// sanitizeHTML removes dangerous constructs from AI-generated HTML.
// It is intentionally conservative: it strips rather than escapes.
func sanitizeHTML(raw string) string {
	s := reScriptBlock.ReplaceAllString(raw, "")
	s = reDangerousOpen.ReplaceAllString(s, "")
	s = reDangerousClose.ReplaceAllString(s, "")
	s = reOnEvent.ReplaceAllString(s, "")
	s = reJavascriptURI.ReplaceAllString(s, `$1="#"`)
	s = reDataURI.ReplaceAllString(s, `$1=""`)
	return s
}

// codeBlockRe matches a markdown fenced code block with an optional language
// tag (e.g. ```html or just ```) and captures the inner content.
var codeBlockRe = regexp.MustCompile("(?is)^```(?:html)?\r?\n(.*?)\r?\n?```\\s*$")

// extractCodeBlock pulls the content out of a markdown fenced code block if
// the model wrapped the HTML in one (```html ... ``` or ``` ... ```),
// otherwise returns the raw string trimmed of whitespace.
func extractCodeBlock(content string) string {
	content = strings.TrimSpace(content)
	if m := codeBlockRe.FindStringSubmatch(content); len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	// Fallback: strip any leading/trailing fence lines manually to handle
	// edge cases like missing closing fence or extra whitespace.
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	start, end := 0, len(lines)
	if len(lines) > 0 && (strings.HasPrefix(lines[0], "```html") || lines[0] == "```") {
		start = 1
	}
	if end > start && strings.TrimSpace(lines[end-1]) == "```" {
		end--
	}
	return strings.TrimSpace(strings.Join(lines[start:end], "\n"))
}

// ─── Gemini native API types ────────────────────────────────────────────────

type geminiPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiRequest struct {
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	Contents          []geminiContent `json:"contents"`
	GenerationConfig  struct {
		MaxOutputTokens int     `json:"maxOutputTokens"`
		Temperature     float64 `json:"temperature"`
		ThinkingConfig  struct {
			ThinkingBudget int `json:"thinkingBudget"`
		} `json:"thinkingConfig"`
	} `json:"generationConfig"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// ─── Handler ───────────────────────────────────────────────────────────────

// HubAIDesignerHandler handles AI-powered Hub page design generation.
type HubAIDesignerHandler struct {
	pool         *pgxpool.Pool
	settingsRepo *repository.HubSettingsRepository
	aiAPIKey     string
	aiModel      string
	httpClient   *http.Client
}

// NewHubAIDesignerHandler creates the handler. aiAPIKey may be empty; in
// that case the Generate endpoint returns 503.
func NewHubAIDesignerHandler(
	pool *pgxpool.Pool,
	settingsRepo *repository.HubSettingsRepository,
	aiAPIKey, aiModel string,
) *HubAIDesignerHandler {
	if aiModel == "" {
		aiModel = "gemini-2.5-flash"
	}
	return &HubAIDesignerHandler{
		pool:         pool,
		settingsRepo: settingsRepo,
		aiAPIKey:     aiAPIKey,
		aiModel:      aiModel,
		httpClient:   &http.Client{Timeout: 60 * time.Second},
	}
}

// systemPrompt is the instruction sent to the AI for every generation request.
const systemPrompt = `You are a senior web designer with mastery of modern web standards, building custom landing pages for online community hubs.

The user describes the VISUAL AESTHETIC they want. A HUB CONTEXT block provides the real hub data.
Your job: apply the requested aesthetic with professional craft to produce a complete, polished hub page.

════════════════════════════════════════
OUTPUT RULES (non-negotiable)
════════════════════════════════════════
- Return a single <div class="hub-custom-page"> containing the full page
- Use inline styles (style="...") for layout and structure — no Tailwind, no external stylesheets
- You MAY include ONE <style> block to style the injected slot components (see SLOT STYLING below)
- NO <script>, inline event handlers (onclick etc.), <iframe>, <form>, <input>, <link>
- NO <html>, <head>, or <body> tags
- Return ONLY the HTML (with optional <style> block), optionally wrapped in a ` + "```html" + ` code block

════════════════════════════════════════
CONTENT RULES (non-negotiable)
════════════════════════════════════════
- Hub name, title, description, about text, and sidebar content MUST come verbatim from HUB CONTEXT
- Member and post counts MUST use exact numbers from HUB CONTEXT
- Do NOT invent links, buttons, navigation items, or feature descriptions
- Do NOT generate any navigation bar, nav menu, or tab bar with links like "Feed", "About", "Contact", "Home", "Explore", or any other section — these do not exist in the app and will be dead links
- Do NOT generate post cards — real posts are injected into #hub-feed at runtime
- The ONLY interactive elements allowed are the four slot divs (#hub-join, #hub-create, #hub-mod, #hub-feed) — everything else is static content
- You are the DESIGNER — layout, color, type, spacing are yours. Content belongs to the hub.

════════════════════════════════════════
REQUIRED SLOTS (place all four in your layout)
════════════════════════════════════════
Four divs will have real UI injected into them at runtime. Place them where they make sense in your design:

1. <div id="hub-join"></div>
   → Subscribe / Join button. Place prominently — hero area, sidebar, or navigation.

2. <div id="hub-create"></div>
   → Create Post button. Place near the post feed or in a toolbar.

3. <div id="hub-mod"></div>
   → Mod Tools link. Only visible to moderators. Place in sidebar or navigation.

4. <div id="hub-feed"></div>
   → Full post feed with sort tabs and search. Place as the main content area.
   MUST set CSS custom properties on this element so injected posts inherit your design colors:
   --color-background, --color-surface, --color-surface-elevated, --color-border,
   --color-text-primary, --color-text-secondary, --color-text-muted, --color-primary, --color-primary-dark
   Example: <div id="hub-feed" style="--color-background:#0d0d1a; --color-surface:#1a1a2e; --color-border:#3a3a5c; --color-text-primary:#e0e0ff; --color-primary:#7070ff; padding:2rem;">

════════════════════════════════════════
SLOT STYLING (design the injected UI to match your aesthetic)
════════════════════════════════════════
Include a <style> block targeting these stable class names to style the injected components:

Buttons:
  .hub-slot-btn           — base style for all injected buttons
  .hub-slot-btn--primary  — join/subscribe button
  .hub-slot-btn--secondary — unsubscribe / secondary action
  .hub-slot-btn--create   — create post button
  .hub-slot-btn--mod      — mod tools button

Post feed controls:
  .hub-slot-tab           — sort tab (Hot / New / Top / Rising)
  .hub-slot-tab--active   — currently selected sort tab
  .hub-slot-search        — search input field

Always scope your CSS to the slot IDs to avoid conflicts:
  #hub-join .hub-slot-btn--primary { background: #00FFFF; color: #000; border-radius: 8px; padding: 10px 24px; font-weight: 700; border: none; cursor: pointer; }
  #hub-feed .hub-slot-tab { background: transparent; color: #aaa; border: none; cursor: pointer; padding: 8px 16px; }
  #hub-feed .hub-slot-tab--active { color: #00FFFF; border-bottom: 2px solid #00FFFF; }
  #hub-feed .hub-slot-search { background: #222; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 8px 12px; }

════════════════════════════════════════
REQUIRED SECTIONS
════════════════════════════════════════
1. HERO — hub title, description, member/post stats from HUB CONTEXT
2. ABOUT / SIDEBAR — hub sidebar content from HUB CONTEXT rendered faithfully, with #hub-join and #hub-mod slots
3. ACTIONS AREA — #hub-create slot near the post feed
4. POST FEED — #hub-feed as the main content area
5. FOOTER — hub name and any links from the sidebar content

════════════════════════════════════════
DESIGN QUALITY STANDARDS
════════════════════════════════════════
The user's aesthetic prompt is your creative direction. Use your judgment on which techniques
serve that direction — do not force any style that contradicts the user's intent.

TOOLKIT (apply where appropriate to the requested aesthetic):
- Layout: CSS Grid and Flexbox. Consider asymmetric bento-style blocks of varying sizes for
  content-heavy sections — but use a simpler layout if the user requests it.
- Typography: Establish a clear scale. Hero text 3–5rem, section heads 1.25–1.75rem, body
  0.9–1rem. Use weight contrast (300 vs 700) to create hierarchy. Oversized expressive
  headlines are a hallmark of contemporary design — use them where the aesthetic calls for it.
- Color: Build a cohesive palette — background, surface, border, text-primary, text-secondary,
  accent. Apply it consistently. Dark-first designs should use proper surface layering, not
  just black backgrounds with white text.
- Depth: Glassmorphism (backdrop-filter: blur + semi-transparent surfaces) works well for
  cards and overlays where it serves the hierarchy — use it purposefully, not everywhere.
  Layer box-shadows (ambient + directional) to create depth without visual noise.
- Spacing: Consistent rhythm — generous padding, clear section separation, content that breathes.
- Borders & radius: Be consistent. Pick a radius scale and stick to it throughout.
- Interactivity hints: cursor:pointer on all clickable elements.
- Icons: Unicode/emoji used sparingly and purposefully, not decoratively everywhere.

AVOID (these read as amateur or dated):
- Centered walls of text as the primary layout
- Uniform rows of identical-sized cards when a varied grid would serve better
- Default browser link styling
- Flat single-color fills on large areas with no depth
- Decorative glassmorphism applied to every surface
- Visual clutter — calm, intentional layouts are the current standard
- Templated, generic-looking output — make it feel crafted and specific to this hub

Aim for 300+ lines of HTML. Short output is not acceptable.`

// callAIAPI sends the user prompt to Gemini and returns the raw response text.
func (h *HubAIDesignerHandler) callAIAPI(ctx context.Context, userPrompt string) (string, error) {
	reqBody := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt}},
		},
		Contents: []geminiContent{
			{Role: "user", Parts: []geminiPart{{Text: userPrompt}}},
		},
	}
	reqBody.GenerationConfig.MaxOutputTokens = 32768
	reqBody.GenerationConfig.Temperature = 0.7
	reqBody.GenerationConfig.ThinkingConfig.ThinkingBudget = 15000

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal gemini request: %w", err)
	}

	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		h.aiModel, h.aiAPIKey,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("build gemini request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini api call: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB cap
	if err != nil {
		return "", fmt.Errorf("read gemini response: %w", err)
	}

	var geminiResp geminiResponse
	if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
		return "", fmt.Errorf("unmarshal gemini response: %w", err)
	}

	if geminiResp.Error != nil {
		return "", fmt.Errorf("gemini api error: %s", geminiResp.Error.Message)
	}
	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("gemini returned no content")
	}

	return geminiResp.Candidates[0].Content.Parts[0].Text, nil
}

// Generate handles POST /api/v1/hubs/:name/ai-design/generate.
// Calls the AI API with the user's prompt, sanitizes the HTML, persists it,
// and returns the sanitized HTML. Requires full_moderator or owner role.
//
// @Summary      Generate AI hub page design
// @Tags         Hubs
// @Accept       json
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        body  body      object  true  "Prompt payload"
// @Success      201   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Failure      503   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/ai-design/generate [post]
func (h *HubAIDesignerHandler) Generate(c *gin.Context) {
	if h.aiAPIKey == "" {
		RespondError(c, http.StatusServiceUnavailable, "AI design feature is not configured")
		return
	}

	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}

	var req struct {
		Prompt string `json:"prompt" binding:"required,max=500"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Prompt is required (max 500 characters)")
		return
	}

	// Fetch real hub data to ground the AI in actual content.
	var (
		hubDisplayName   string
		hubDescription   string
		hubSidebarMD     string
		hubMemberCount   int
		hubPostCount     int
	)
	_ = h.pool.QueryRow(c.Request.Context(), `
		SELECT
			COALESCE(hs.display_title, h.title, h.name),
			COALESCE(h.description, ''),
			COALESCE(hs.sidebar_markdown, '')
		FROM hubs h
		LEFT JOIN hub_settings hs ON hs.hub_id = h.id
		WHERE h.id = $1`, hubID,
	).Scan(&hubDisplayName, &hubDescription, &hubSidebarMD)
	_ = h.pool.QueryRow(c.Request.Context(),
		`SELECT COUNT(*) FROM hub_subscriptions WHERE hub_id = $1`, hubID,
	).Scan(&hubMemberCount)
	_ = h.pool.QueryRow(c.Request.Context(),
		`SELECT COUNT(*) FROM platform_posts WHERE hub_id = $1`, hubID,
	).Scan(&hubPostCount)

	hubContext := fmt.Sprintf(`HUB CONTEXT (use this data verbatim — do not invent hub-specific content):
Name: %s
Description: %s
Members: %d
Posts: %d
Sidebar:
%s

AESTHETIC REQUEST:
%s`, hubDisplayName, hubDescription, hubMemberCount, hubPostCount, hubSidebarMD, req.Prompt)

	// Use a detached context so the global 30s request timeout doesn't kill the AI call.
	aiCtx, aiCancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer aiCancel()
	rawHTML, err := h.callAIAPI(aiCtx, hubContext)
	if err != nil {
		zlog.Error().Err(err).Str("hub", hubName).Msg("AI API call failed")
		RespondError(c, http.StatusBadGateway, "AI generation failed; please try again")
		return
	}

	zlog.Info().Str("hub", hubName).Int("raw_len", len(rawHTML)).Str("raw_preview", func() string {
		if len(rawHTML) > 200 {
			return rawHTML[:200]
		}
		return rawHTML
	}()).Msg("AI raw response")

	clean := sanitizeHTML(extractCodeBlock(rawHTML))

	if len(clean) < 1000 {
		zlog.Error().Str("hub", hubName).Int("len", len(clean)).Msg("AI returned incomplete design")
		RespondError(c, http.StatusBadGateway, "AI returned an incomplete design; please try again")
		return
	}

	// Auto-name: "Design #N" where N = existing count + 1 for this hub.
	// Use aiCtx — the gin request context may already be expired after a long generation.
	var count int
	_ = h.pool.QueryRow(aiCtx,
		`SELECT COUNT(*) FROM hub_ai_designs WHERE hub_id = $1`, hubID,
	).Scan(&count)
	autoName := fmt.Sprintf("Design #%d", count+1)

	// Persist the new design (inactive by default).
	var designID int
	err = h.pool.QueryRow(aiCtx,
		`INSERT INTO hub_ai_designs (hub_id, prompt, html_content, created_by, name)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		hubID, req.Prompt, clean, userID, autoName,
	).Scan(&designID)
	if err != nil {
		zlog.Error().Err(err).Msg("Failed to save AI design")
		RespondError(c, http.StatusInternalServerError, "Failed to save design")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":           designID,
		"name":         autoName,
		"html_content": clean,
		"prompt":       req.Prompt,
		"message":      "Design generated. Use the activate endpoint to publish it.",
	})
}

// GetActive handles GET /api/v1/hubs/:name/ai-design.
// Returns the currently active AI design for the hub (public).
//
// @Summary      Get active AI hub design
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      404   {object}  gin.H
// @Router       /hubs/{name}/ai-design [get]
func (h *HubAIDesignerHandler) GetActive(c *gin.Context) {
	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	var design struct {
		ID          int       `json:"id"`
		Name        string    `json:"name"`
		Prompt      string    `json:"prompt"`
		HTMLContent string    `json:"html_content"`
		CreatedAt   time.Time `json:"created_at"`
	}
	err = h.pool.QueryRow(c.Request.Context(),
		`SELECT id, name, prompt, html_content, created_at FROM hub_ai_designs
		 WHERE hub_id = $1 AND is_active = true LIMIT 1`,
		hubID,
	).Scan(&design.ID, &design.Name, &design.Prompt, &design.HTMLContent, &design.CreatedAt)
	if err != nil {
		// No active design is a normal state — return empty.
		c.JSON(http.StatusOK, gin.H{"design": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"design": design})
}

// ListDesigns handles GET /api/v1/hubs/:name/ai-designs.
// Returns all saved designs for a hub (moderators only).
//
// @Summary      List AI hub designs
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/ai-designs [get]
func (h *HubAIDesignerHandler) ListDesigns(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
	}

	rows, err := h.pool.Query(c.Request.Context(),
		`SELECT id, name, prompt, html_content, is_active, created_at FROM hub_ai_designs
		 WHERE hub_id = $1 ORDER BY created_at DESC LIMIT 20`,
		hubID,
	)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list designs")
		return
	}
	defer rows.Close()

	type designRow struct {
		ID          int       `json:"id"`
		Name        string    `json:"name"`
		Prompt      string    `json:"prompt"`
		HTMLContent string    `json:"html_content"`
		IsActive    bool      `json:"is_active"`
		CreatedAt   time.Time `json:"created_at"`
	}
	var designs []designRow
	for rows.Next() {
		var d designRow
		if err := rows.Scan(&d.ID, &d.Name, &d.Prompt, &d.HTMLContent, &d.IsActive, &d.CreatedAt); err != nil {
			continue
		}
		designs = append(designs, d)
	}

	c.JSON(http.StatusOK, gin.H{"designs": designs})
}

// Activate handles POST /api/v1/hubs/:name/ai-designs/:id/activate.
// Deactivates all other designs for the hub and activates the chosen one.
// Requires full_moderator or owner.
//
// @Summary      Activate an AI hub design
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        id    path      int     true  "Design ID"
// @Success      200   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/ai-designs/{id}/activate [post]
func (h *HubAIDesignerHandler) Activate(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	designID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}

	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Database error")
		return
	}
	defer tx.Rollback(c.Request.Context())

	// Deactivate all designs for this hub.
	if _, err := tx.Exec(c.Request.Context(),
		`UPDATE hub_ai_designs SET is_active = false WHERE hub_id = $1`, hubID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to deactivate designs")
		return
	}

	// Activate the chosen design (must belong to this hub).
	tag, err := tx.Exec(c.Request.Context(),
		`UPDATE hub_ai_designs SET is_active = true WHERE id = $1 AND hub_id = $2`,
		designID, hubID)
	if err != nil || tag.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Design not found")
		return
	}

	if err := tx.Commit(c.Request.Context()); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to activate design")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Design activated"})
}

// Deactivate handles POST /api/v1/hubs/:name/ai-design/deactivate.
// Removes any active AI design so the hub shows its default layout.
// Requires full_moderator or owner.
//
// @Summary      Deactivate the active AI hub design
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Success      200   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/ai-design/deactivate [post]
func (h *HubAIDesignerHandler) Deactivate(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}

	if _, err := h.pool.Exec(c.Request.Context(),
		`UPDATE hub_ai_designs SET is_active = false WHERE hub_id = $1`, hubID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to deactivate design")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Active design removed"})
}

// DeleteDesign handles DELETE /api/v1/hubs/:name/ai-designs/:id.
// Permanently deletes a design. Requires owner role.
//
// @Summary      Delete an AI hub design
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        id    path      int     true  "Design ID"
// @Success      200   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/ai-designs/{id} [delete]
func (h *HubAIDesignerHandler) DeleteDesign(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	designID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil || *role != models.ModeratorRoleOwner {
			RespondError(c, http.StatusForbidden, "Requires owner role")
			return
		}
	}

	tag, err := h.pool.Exec(c.Request.Context(),
		`DELETE FROM hub_ai_designs WHERE id = $1 AND hub_id = $2`, designID, hubID)
	if err != nil || tag.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Design not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Design deleted"})
}

// CopyDesign handles POST /api/v1/hubs/:name/ai-designs/:id/copy.
// Duplicates a design with name "{original} Copy". Requires full_moderator or owner.
//
// @Summary      Duplicate an AI hub design
// @Tags         Hubs
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        id    path      int     true  "Design ID"
// @Success      201   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/ai-designs/{id}/copy [post]
func (h *HubAIDesignerHandler) CopyDesign(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	designID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}

	// Fetch the original.
	var orig struct {
		Name        string
		Prompt      string
		HTMLContent string
	}
	err = h.pool.QueryRow(c.Request.Context(),
		`SELECT name, prompt, html_content FROM hub_ai_designs WHERE id = $1 AND hub_id = $2`,
		designID, hubID,
	).Scan(&orig.Name, &orig.Prompt, &orig.HTMLContent)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Design not found")
		return
	}

	copyName := orig.Name + " Copy"

	var newID int
	err = h.pool.QueryRow(c.Request.Context(),
		`INSERT INTO hub_ai_designs (hub_id, prompt, html_content, created_by, name)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		hubID, orig.Prompt, orig.HTMLContent, userID, copyName,
	).Scan(&newID)
	if err != nil {
		zlog.Error().Err(err).Msg("Failed to copy AI design")
		RespondError(c, http.StatusInternalServerError, "Failed to copy design")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":      newID,
		"name":    copyName,
		"message": "Design copied",
	})
}

// UpdateDesign handles PUT /api/v1/hubs/:name/ai-designs/:id.
// Overwrites a design's name and HTML content in place. Re-sanitizes the HTML.
// Requires full_moderator or owner.
//
// @Summary      Update an AI hub design
// @Tags         Hubs
// @Accept       json
// @Produce      json
// @Param        name  path      string  true  "Hub name"
// @Param        id    path      int     true  "Design ID"
// @Param        body  body      object  true  "Update payload"
// @Success      200   {object}  gin.H
// @Failure      400   {object}  gin.H
// @Failure      403   {object}  gin.H
// @Security     BearerAuth
// @Router       /hubs/{name}/ai-designs/{id} [put]
func (h *HubAIDesignerHandler) UpdateDesign(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	designID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}

	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}

	var req struct {
		Name        string `json:"name" binding:"required,max=100"`
		HTMLContent string `json:"html_content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "name and html_content are required")
		return
	}

	clean := sanitizeHTML(req.HTMLContent)

	tag, err := h.pool.Exec(c.Request.Context(),
		`UPDATE hub_ai_designs SET name = $1, html_content = $2 WHERE id = $3 AND hub_id = $4`,
		req.Name, clean, designID, hubID,
	)
	if err != nil || tag.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Design not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Design updated",
		"html_content": clean,
	})
}

// GetDesign handles GET /api/v1/hubs/:name/ai-designs/:id.
// Returns a single design by ID. Requires moderator role.
func (h *HubAIDesignerHandler) GetDesign(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}
	designID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}
	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}
	var design struct {
		ID          int       `json:"id"`
		Name        string    `json:"name"`
		Prompt      string    `json:"prompt"`
		HTMLContent string    `json:"html_content"`
		IsActive    bool      `json:"is_active"`
		CreatedAt   time.Time `json:"created_at"`
	}
	err = h.pool.QueryRow(c.Request.Context(),
		`SELECT id, name, prompt, html_content, is_active, created_at FROM hub_ai_designs WHERE id = $1 AND hub_id = $2`,
		designID, hubID,
	).Scan(&design.ID, &design.Name, &design.Prompt, &design.HTMLContent, &design.IsActive, &design.CreatedAt)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Design not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"design": design})
}

// GetDesignVersions handles GET /api/v1/hubs/:name/ai-designs/:id/versions.
// Returns the version history (up to 20) for a design.
func (h *HubAIDesignerHandler) GetDesignVersions(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}
	designID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}
	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}
	rows, err := h.pool.Query(c.Request.Context(),
		`SELECT id, html_content, created_at FROM hub_ai_design_versions
		 WHERE design_id = $1 ORDER BY created_at DESC LIMIT 20`,
		designID,
	)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch versions")
		return
	}
	defer rows.Close()
	type version struct {
		ID          int       `json:"id"`
		HTMLContent string    `json:"html_content"`
		CreatedAt   time.Time `json:"created_at"`
	}
	versions := []version{}
	for rows.Next() {
		var v version
		if err := rows.Scan(&v.ID, &v.HTMLContent, &v.CreatedAt); err == nil {
			versions = append(versions, v)
		}
	}
	c.JSON(http.StatusOK, gin.H{"versions": versions})
}

// SaveDesignVersion handles POST /api/v1/hubs/:name/ai-designs/:id/versions.
// Saves the current HTML as a new version, pruning to 20 versions per design.
func (h *HubAIDesignerHandler) SaveDesignVersion(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}
	designID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}
	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}
	var req struct {
		HTMLContent string `json:"html_content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "html_content is required")
		return
	}
	clean := sanitizeHTML(req.HTMLContent)
	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save version")
		return
	}
	defer tx.Rollback(c.Request.Context())

	var versionID int
	err = tx.QueryRow(c.Request.Context(),
		`INSERT INTO hub_ai_design_versions (design_id, html_content, created_by)
		 VALUES ($1, $2, $3) RETURNING id`,
		designID, clean, userID,
	).Scan(&versionID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save version")
		return
	}
	// Also update the design's html_content to match the saved version.
	_, _ = tx.Exec(c.Request.Context(),
		`UPDATE hub_ai_designs SET html_content = $1 WHERE id = $2 AND hub_id = $3`,
		clean, designID, hubID,
	)
	// Prune to 20 versions.
	_, _ = tx.Exec(c.Request.Context(),
		`DELETE FROM hub_ai_design_versions WHERE design_id = $1
		 AND id NOT IN (
			SELECT id FROM hub_ai_design_versions WHERE design_id = $1
			ORDER BY created_at DESC LIMIT 20
		 )`, designID,
	)
	if err := tx.Commit(c.Request.Context()); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to commit version")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Version saved", "version_id": versionID, "html_content": clean})
}

// chatSystemPrompt is used for iterative AI refinement of an existing design.
const chatSystemPrompt = `You are a senior web designer refining an existing community hub page design.

The user will provide their CURRENT HTML design and a REQUEST to change it.
Return the COMPLETE updated HTML — not just the changed section, the entire thing.

OUTPUT RULES (non-negotiable):
- Return a single <div class="hub-custom-page"> containing the full updated page
- Use inline styles for layout and structure — no Tailwind, no external stylesheets
- You MAY include ONE <style> block to style injected slot components
- NO <script>, inline event handlers (onclick etc.), <iframe>, <form>, <input>, <link>
- NO <html>, <head>, or <body> tags
- Return ONLY the HTML, optionally wrapped in a ` + "```html" + ` code block
- Preserve all existing hub content (name, description, sidebar text, stats) verbatim
- Preserve all four slot divs: #hub-feed, #hub-join, #hub-create, #hub-mod
- Apply the user's requested change while keeping everything else intact

SLOT CLASS NAMES (use in your <style> block to style injected UI):
Buttons: .hub-slot-btn, .hub-slot-btn--primary, .hub-slot-btn--secondary, .hub-slot-btn--create, .hub-slot-btn--mod
Feed controls: .hub-slot-tab, .hub-slot-tab--active, .hub-slot-search
Always scope CSS rules to slot IDs (e.g. #hub-join .hub-slot-btn--primary { ... })`

// ChatDesign handles POST /api/v1/hubs/:name/ai-designs/:id/chat.
// Sends the current HTML and a user message to Gemini and returns refined HTML.
func (h *HubAIDesignerHandler) ChatDesign(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	hubName := c.Param("name")
	hubID, err := h.settingsRepo.GetHubIDByName(c.Request.Context(), hubName)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}
	_, err = strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid design ID")
		return
	}
	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID)
		if err != nil || role == nil {
			RespondError(c, http.StatusForbidden, "Not a moderator")
			return
		}
		if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}
	var req struct {
		CurrentHTML string `json:"current_html" binding:"required"`
		Message     string `json:"message" binding:"required,max=1000"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "current_html and message are required")
		return
	}
	prompt := fmt.Sprintf("CURRENT HTML:\n%s\n\nREQUEST:\n%s", req.CurrentHTML, req.Message)

	reqBody := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: chatSystemPrompt}},
		},
		Contents: []geminiContent{
			{Role: "user", Parts: []geminiPart{{Text: prompt}}},
		},
	}
	reqBody.GenerationConfig.MaxOutputTokens = 32768
	reqBody.GenerationConfig.Temperature = 0.5
	reqBody.GenerationConfig.ThinkingConfig.ThinkingBudget = 8000

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to build request")
		return
	}
	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		h.aiModel, h.aiAPIKey,
	)
	aiCtx, aiCancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer aiCancel()
	httpReq, err := http.NewRequestWithContext(aiCtx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to build AI request")
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		RespondError(c, http.StatusBadGateway, "AI request failed")
		return
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	var geminiResp geminiResponse
	if err := json.Unmarshal(respBytes, &geminiResp); err != nil || geminiResp.Error != nil {
		RespondError(c, http.StatusBadGateway, "AI returned an error")
		return
	}
	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		RespondError(c, http.StatusBadGateway, "AI returned no content")
		return
	}
	rawHTML := geminiResp.Candidates[0].Content.Parts[0].Text
	clean := sanitizeHTML(extractCodeBlock(rawHTML))
	if len(clean) < 500 {
		RespondError(c, http.StatusBadGateway, "AI returned an incomplete response; please try again")
		return
	}
	_ = userID
	c.JSON(http.StatusOK, gin.H{"html_content": clean})
}
