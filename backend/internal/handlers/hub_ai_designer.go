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

// extractCodeBlock pulls the content out of a markdown fenced code block if
// the model wrapped the HTML in one (```html ... ```), otherwise returns the
// raw string trimmed of whitespace.
func extractCodeBlock(content string) string {
	content = strings.TrimSpace(content)
	// Common fence patterns: ```html, ```HTML, ```
	for _, fence := range []string{"```html\n", "```HTML\n", "```\n"} {
		if idx := strings.Index(content, fence); idx != -1 {
			start := idx + len(fence)
			end := strings.LastIndex(content, "```")
			if end > start {
				return strings.TrimSpace(content[start:end])
			}
		}
	}
	return content
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
const systemPrompt = `You are an expert web designer specialising in community hub pages.
The user will describe the look and feel they want for their community hub page.
Your task: produce a self-contained HTML snippet (wrapped in a single <div class="hub-custom-page">)
that uses only Tailwind CSS utility classes for styling. Do NOT use any external scripts,
<script> tags, <style> tags with JavaScript, inline event handlers (onclick, onload, etc.),
<iframe>, <form>, <input>, or <link> elements. Do NOT include <html>, <head>, or <body> tags.
Return ONLY the HTML code, optionally wrapped in a markdown ` + "```html" + ` code block.
Keep the design clean, modern, and appropriate for a community platform.`

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
	reqBody.GenerationConfig.MaxOutputTokens = 4096
	reqBody.GenerationConfig.Temperature = 0.7

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

	rawHTML, err := h.callAIAPI(c.Request.Context(), req.Prompt)
	if err != nil {
		zlog.Error().Err(err).Str("hub", hubName).Msg("AI API call failed")
		RespondError(c, http.StatusBadGateway, "AI generation failed; please try again")
		return
	}

	clean := sanitizeHTML(extractCodeBlock(rawHTML))

	// Auto-name: "Design #N" where N = existing count + 1 for this hub.
	var count int
	_ = h.pool.QueryRow(c.Request.Context(),
		`SELECT COUNT(*) FROM hub_ai_designs WHERE hub_id = $1`, hubID,
	).Scan(&count)
	autoName := fmt.Sprintf("Design #%d", count+1)

	// Persist the new design (inactive by default).
	var designID int
	err = h.pool.QueryRow(c.Request.Context(),
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
