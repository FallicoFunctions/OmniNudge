package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var hubAIDesignerCounter int64

func uniqueHubAIDesignerName(base string) string {
	id := atomic.AddInt64(&hubAIDesignerCounter, 1)
	return fmt.Sprintf("%s_ai_design_%d_%d", base, time.Now().UnixNano(), id)
}

type hubAIDesignerTestFixture struct {
	db      *database.Database
	handler *HubAIDesignerHandler
	hubName string
	hubID   int
	ownerID int
	cleanup func()
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func setupHubAIDesignerTest(t *testing.T) *hubAIDesignerTestFixture {
	t.Helper()

	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: uniqueHubAIDesignerName("owner"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, owner))

	hubRepo := models.NewHubRepository(db.Pool)
	hubName := uniqueHubAIDesignerName("hub")
	hub := &models.Hub{
		Name:           hubName,
		NameNormalized: hubName,
		Type:           "public",
		ContentOptions: "any",
		CreatedBy:      &owner.ID,
	}
	require.NoError(t, hubRepo.Create(ctx, hub))
	createdHub, err := hubRepo.GetByName(ctx, hubName)
	require.NoError(t, err)

	settingsRepo := repository.NewHubSettingsRepository(db.Pool)
	require.NoError(t, settingsRepo.AddModerator(ctx, createdHub.ID, owner.ID, models.ModeratorRoleOwner))

	allowText, allowLink, allowImage, allowVideo := mapContentOptions(hub.ContentOptions)
	defaults := buildDefaultHubSettings(createdHub.ID, hub.Type, allowText, allowLink, allowImage, allowVideo)
	require.NoError(t, settingsRepo.EnsureDefaults(ctx, defaults, &owner.ID))

	return &hubAIDesignerTestFixture{
		db:      db,
		handler: NewHubAIDesignerHandler(db.Pool, settingsRepo, "", ""),
		hubName: hubName,
		hubID:   createdHub.ID,
		ownerID: owner.ID,
		cleanup: func() { db.Close() },
	}
}

func validAIDesignHTML() string {
	return `
		<style>
			.hub-custom-page .hero { color: white; }
			#hub-feed .hub-slot-tab { color: cyan; }
		</style>
		<div class="hub-custom-page">
			<section class="hero">Welcome</section>
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`
}

func legacyInvalidAIDesignHTML() string {
	return `
		<div class="hub-custom-page">
			<section class="hero">Missing create and mod slots</section>
			<div id="hub-join"></div>
			<div id="hub-feed"></div>
		</div>
	`
}

func insertHubAIDesign(t *testing.T, f *hubAIDesignerTestFixture, html string, active bool) int {
	t.Helper()

	var id int
	err := f.db.Pool.QueryRow(context.Background(), `
		INSERT INTO hub_ai_designs (hub_id, prompt, html_content, created_by, name, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, f.hubID, "test prompt", html, f.ownerID, uniqueHubAIDesignerName("design"), active).Scan(&id)
	require.NoError(t, err)
	return id
}

func performActivateAIDesignRequest(f *hubAIDesignerTestFixture, designID int) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/ai-designs/:id/activate", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.Activate(c)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/hubs/%s/ai-designs/%d/activate", f.hubName, designID), nil)
	router.ServeHTTP(w, req)
	return w
}

func performGenerateAIDesignRequest(f *hubAIDesignerTestFixture, body string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/ai-design/generate", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.Generate(c)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/hubs/%s/ai-design/generate", f.hubName), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	return w
}

func geminiHTTPResponse(t *testing.T, text string) *http.Response {
	t.Helper()

	bodyBytes, err := json.Marshal(map[string]any{
		"candidates": []any{
			map[string]any{
				"content": map[string]any{
					"parts": []any{
						map[string]any{"text": text},
					},
				},
			},
		},
	})
	require.NoError(t, err)

	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewReader(bodyBytes)),
	}
}

func designActiveState(t *testing.T, f *hubAIDesignerTestFixture, designID int) bool {
	t.Helper()

	var active bool
	err := f.db.Pool.QueryRow(context.Background(), `
		SELECT is_active FROM hub_ai_designs WHERE id = $1 AND hub_id = $2
	`, designID, f.hubID).Scan(&active)
	require.NoError(t, err)
	return active
}

func TestActivateAIDesign_RejectsLegacyInvalidDesign(t *testing.T) {
	f := setupHubAIDesignerTest(t)
	defer f.cleanup()

	activeValidID := insertHubAIDesign(t, f, validAIDesignHTML(), true)
	invalidID := insertHubAIDesign(t, f, legacyInvalidAIDesignHTML(), false)

	w := performActivateAIDesignRequest(f, invalidID)

	require.Equal(t, http.StatusBadRequest, w.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "Design validation failed. Please try again.", body["message"])
	assert.True(t, designActiveState(t, f, activeValidID))
	assert.False(t, designActiveState(t, f, invalidID))
}

func TestActivateAIDesign_SucceedsForValidDesign(t *testing.T) {
	f := setupHubAIDesignerTest(t)
	defer f.cleanup()

	oldActiveID := insertHubAIDesign(t, f, validAIDesignHTML(), true)
	newValidID := insertHubAIDesign(t, f, validAIDesignHTML(), false)

	w := performActivateAIDesignRequest(f, newValidID)

	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "Design activated", body["message"])
	assert.False(t, designActiveState(t, f, oldActiveID))
	assert.True(t, designActiveState(t, f, newValidID))
}

func TestGenerateAIDesign_RetriesOnceAfterValidationFailure(t *testing.T) {
	f := setupHubAIDesignerTest(t)
	defer f.cleanup()

	f.handler.aiAPIKey = "test-key"
	validGeneratedHTML := `
		<style>
			.hub-custom-page .hero { color: white; }
			.hub-custom-page .hero-copy { color: rgba(255,255,255,0.84); line-height: 1.6; }
			.hub-custom-page .content-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px; }
			.hub-custom-page .panel { background: rgba(20,20,24,0.82); border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 24px; }
			.hub-custom-page .hero-stack { display: flex; flex-direction: column; gap: 16px; }
			.hub-custom-page .stats-row { display: flex; gap: 12px; flex-wrap: wrap; }
			#hub-feed .hub-slot-feed { background: rgba(20, 20, 32, 0.82); border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 18px; }
			#hub-feed .hub-slot-feed-controls { gap: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.12); }
			#hub-feed .hub-slot-tab { background: transparent; color: #aaa; border: none; cursor: pointer; padding: 8px 16px; }
			#hub-feed .hub-slot-tab--active { color: #00FFFF; border-bottom: 2px solid #00FFFF; }
			#hub-feed .hub-slot-search { background: #222; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 8px 12px; }
			#hub-feed .hub-slot-post-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; padding: 16px; }
		</style>
		<div class="hub-custom-page" style="width:100%; max-width:100%; box-sizing:border-box; overflow-x:hidden; background:#101014; color:#f5f5f5; padding:32px;">
			<section class="hero hero-stack panel">
				<h1>Welcome</h1>
				<p class="hero-copy">A bold and high-contrast concept for the hub.</p>
				<p class="hero-copy">This repair payload is intentionally long enough to satisfy the generation completeness guard.</p>
				<div class="stats-row">
					<span class="panel">Members: 12</span>
					<span class="panel">Posts: 4</span>
				</div>
				<div id="hub-join"></div>
			</section>
			<div class="content-grid" style="margin-top:24px;">
				<section class="panel">
					<h2>About</h2>
					<p class="hero-copy">Detailed context block one.</p>
					<p class="hero-copy">Detailed context block two.</p>
					<p class="hero-copy">Detailed context block three.</p>
					<p class="hero-copy">Detailed context block four.</p>
					<p class="hero-copy">Detailed context block five.</p>
					<div id="hub-mod"></div>
				</section>
				<section class="panel">
					<h2>Actions</h2>
					<p class="hero-copy">Primary call to action area with ample spacing and contrast.</p>
					<p class="hero-copy">Secondary explanation copy to keep the layout complete and intentional.</p>
					<div id="hub-create"></div>
				</section>
			</div>
			<section class="panel" style="margin-top:24px;">
				<h2>Feed</h2>
				<p class="hero-copy">This section reserves space for the runtime feed and keeps the design valid.</p>
				<p class="hero-copy">Additional descriptive copy helps ensure the generated design is not treated as incomplete.</p>
				<p class="hero-copy">The feed host below carries the runtime theme variables only.</p>
				<div id="hub-feed" style="--color-background:#0d0d1a; --color-surface:#1a1a2e; --color-surface-elevated:#202038; --color-border:#3a3a5c; --color-text-primary:#e0e0ff; --color-text-secondary:#b8b8d8; --color-text-muted:#8d8da8; --color-primary:#66e3ff; --color-primary-dark:#1ab6db; padding:24px;"></div>
			</section>
			<footer class="panel" style="margin-top:24px;">
				<p class="hero-copy">Footer copy one.</p>
				<p class="hero-copy">Footer copy two.</p>
				<p class="hero-copy">Footer copy three.</p>
				<p class="hero-copy">Footer copy four.</p>
			</footer>
		</div>
	`

	requestCount := 0
	prompts := make([]string, 0, 2)
	temperatures := make([]float64, 0, 2)
	f.handler.httpClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			requestCount++

			payload, err := io.ReadAll(req.Body)
			require.NoError(t, err)

			var geminiReq geminiRequest
			require.NoError(t, json.Unmarshal(payload, &geminiReq))
			prompts = append(prompts, geminiReq.Contents[0].Parts[0].Text)
			temperatures = append(temperatures, geminiReq.GenerationConfig.Temperature)

			switch requestCount {
			case 1:
				return geminiHTTPResponse(t, `
					<style>.hero { color: red; }</style>
					<div class="hub-custom-page">
						<div id="hub-join"></div>
						<div id="hub-create"></div>
						<div id="hub-mod"></div>
						<div id="hub-feed"></div>
					</div>
				`), nil
			case 2:
				return geminiHTTPResponse(t, validGeneratedHTML), nil
			default:
				t.Fatalf("unexpected AI call count: %d", requestCount)
				return nil, nil
			}
		}),
	}

	w := performGenerateAIDesignRequest(f, `{"prompt":"make it bold and high contrast"}`)

	require.Equal(t, http.StatusCreated, w.Code)
	assert.Equal(t, 2, requestCount)
	require.Len(t, temperatures, 2)
	assert.Equal(t, generateDesignTemperature, temperatures[0])
	assert.Equal(t, repairDesignTemperature, temperatures[1])
	require.Len(t, prompts, 2)
	assert.Contains(t, prompts[1], "VALIDATION ERROR:")
	assert.Contains(t, prompts[1], "ordinary CSS selectors must be scoped")

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "make it bold and high contrast", body["prompt"])
	assert.Equal(t, "Design generated. Use the activate endpoint to publish it.", body["message"])
}

func TestGenerateAIDesign_ReturnsInvalidDesignWhenRepairAlsoFails(t *testing.T) {
	f := setupHubAIDesignerTest(t)
	defer f.cleanup()

	f.handler.aiAPIKey = "test-key"

	invalidHTML := `
		<style>
			#hub-feed .hub-slot-feed {
				display grid;
			}
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	requestCount := 0
	f.handler.httpClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			requestCount++
			return geminiHTTPResponse(t, invalidHTML), nil
		}),
	}

	w := performGenerateAIDesignRequest(f, `{"prompt":"make it dramatic"}`)

	require.Equal(t, http.StatusBadGateway, w.Code)
	assert.Equal(t, 2, requestCount)

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "AI returned invalid design; please try again", body["message"])
}

func TestValidateAIDesignHTML_AllowsScopedSelectorsAndRequiredSlots(t *testing.T) {
	html := `
		<style>
			.hub-custom-page .hero { color: white; }
			#hub-feed .hub-slot-tab { color: cyan; }
			#hub-create > .hub-slot-btn--create { border-radius: 999px; }
			@media (max-width: 768px) {
				.hub-custom-page .hero { padding: 16px; }
			}
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateAIDesignHTML_RejectsFeedHostLayoutRules(t *testing.T) {
	cases := []struct {
		name string
		css  string
	}{
		{name: "grid display", css: "#hub-feed { display: grid; }"},
		{name: "grid display important", css: "#hub-feed { display: grid !important; }"},
		{name: "flex display", css: "#hub-feed { display: flex; }"},
		{name: "grid template shorthand", css: "#hub-feed { grid-template: \"a b\" 1fr / 1fr 1fr; }"},
		{name: "grid template", css: "#hub-feed { grid-template-columns: repeat(3, 1fr); }"},
		{name: "grid auto", css: "#hub-feed { grid-auto-flow: column; }"},
		{name: "flex direction", css: "#hub-feed { flex-direction: row; }"},
		{name: "flex wrap", css: "#hub-feed { flex-wrap: wrap; }"},
		{name: "place items", css: "#hub-feed { place-items: center; }"},
		{name: "align items", css: "#hub-feed { align-items: stretch; }"},
		{name: "justify content", css: "#hub-feed { justify-content: space-between; }"},
		{name: "columns", css: "#hub-feed { column-count: 2; }"},
		{name: "absolute position", css: "#hub-feed { position: absolute; }"},
		{name: "fixed position", css: "#hub-feed { position: fixed; }"},
		{name: "clipping fixed height", css: "#hub-feed { height: 320px; overflow: hidden; }"},
		{name: "qualified host selector", css: "#hub-feed.feed-shell { display: grid; }"},
		{name: "media nested host selector", css: "@media (min-width: 800px) { #hub-feed { display: flex; } }"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			html := `
				<style>` + tc.css + `</style>
				<div class="hub-custom-page">
					<div id="hub-join"></div>
					<div id="hub-create"></div>
					<div id="hub-mod"></div>
					<div id="hub-feed"></div>
				</div>
			`

			err := validateAIDesignHTML(html)
			require.Error(t, err)
			assert.Contains(t, strings.ToLower(err.Error()), "hub-feed")
		})
	}
}

func TestValidateAIDesignHTML_RejectsInlineFeedHostLayoutRules(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed" style="--color-background:#111; display:grid; grid-template-columns: repeat(2, 1fr);"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "hub-feed")
}

func TestValidateAIDesignHTML_AllowsFeedHostThemeAndDescendantLayoutRules(t *testing.T) {
	html := `
		<style>
			#hub-feed {
				--color-background: #101018;
				padding: 24px;
				border: 1px solid rgba(255,255,255,0.16);
				border-radius: 18px;
				background: var(--color-background);
			}
			#hub-feed .hub-slot-feed { display: grid; gap: 18px; }
			#hub-feed .hub-slot-feed-controls { display: flex; align-items: center; justify-content: space-between; }
			#hub-feed .hub-slot-feed-list { display: grid; grid-template-columns: 1fr; }
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateAIDesignHTML_AllowsGroupedScopedSelectors(t *testing.T) {
	html := `
		<style>
			.hub-custom-page .hero,
			.hub-custom-page .stats,
			#hub-feed .hub-slot-post-card {
				border: 1px solid rgba(255,255,255,0.16);
				background: rgba(16,16,24,0.84);
			}

			#hub-join .hub-slot-btn--primary,
			#hub-create .hub-slot-btn--create,
			#hub-mod .hub-slot-btn--mod {
				border-radius: 999px;
				font-weight: 700;
			}
		</style>
		<div class="hub-custom-page">
			<section class="hero">Underreported News</section>
			<section class="stats">12,345 members</section>
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateAIDesignHTML_EnforcesPromptSelectorContract(t *testing.T) {
	cases := []struct {
		name      string
		selector  string
		wantError bool
	}{
		{name: "bad bare heading", selector: "h1", wantError: true},
		{name: "bad unscoped class", selector: ".hero", wantError: true},
		{name: "bad qualified unscoped element class", selector: "section.stats", wantError: true},
		{name: "bad grouped scoped and unscoped", selector: ".hub-custom-page .hero, h2", wantError: true},
		{name: "good scoped heading", selector: ".hub-custom-page h1"},
		{name: "good scoped class", selector: ".hub-custom-page .hero"},
		{name: "good feed post card", selector: "#hub-feed .hub-slot-post-card"},
		{name: "good create button", selector: "#hub-create .hub-slot-btn--create"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			html := `
				<style>
					` + tc.selector + ` {
						color: var(--color-text-primary);
						border: 1px solid rgba(255,255,255,0.16);
					}
				</style>
				<div class="hub-custom-page">
					<h1 class="hero">Underreported News</h1>
					<section class="stats">12,345 members</section>
					<div id="hub-join"></div>
					<div id="hub-create"></div>
					<div id="hub-mod"></div>
					<div id="hub-feed"></div>
				</div>
			`

			err := validateAIDesignHTML(html)
			if tc.wantError {
				require.Error(t, err)
				assert.Contains(t, strings.ToLower(err.Error()), "scoped")
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestValidateAIDesignHTML_AllowsStyleAfterRoot(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
		<style>
			.hub-custom-page .hero { color: white; }
		</style>
	`

	err := validateAIDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateAIDesignHTML_RejectsUnscopedSelectors(t *testing.T) {
	html := `
		<style>
			div { color: red; }
			input { border: none; }
			[data-x] { display: block; }
			.shared-card { padding: 8px; }
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "scoped")
}

func TestValidateAIDesignHTML_ReportsMalformedCSSSnippet(t *testing.T) {
	html := `
		<style>
			#hub-feed .hub-slot-feed {
				display grid;
			}
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "CSS declarations must be property-value pairs near")
	assert.Contains(t, err.Error(), "display grid")
}

func TestValidateAIDesignHTML_RejectsNavAndDeadLinks(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<nav><a href="#">Feed</a></nav>
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "nav")
}

func TestValidateAIDesignHTML_RejectsDeadLinksWithoutNav(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<a href="">Empty</a>
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "dead links")
}

func TestValidateAIDesignHTML_AllowsNonDeadAnchors(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<a href="https://example.com/feed">Sidebar link</a>
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateAIDesignHTML_RejectsGlobalBodyAndButtonRules(t *testing.T) {
	html := `
		<style>
			body { overflow: hidden; }
			button { display: none; }
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "scoped")
}

func TestValidateAIDesignHTML_RejectsGroupedGlobalSelectors(t *testing.T) {
	html := `
		<style>
			.hub-custom-page .hero, body { overflow: hidden; }
			#hub-feed .hub-slot-tab, a { color: red; }
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "scoped")
}

func TestValidateAIDesignHTML_RejectsWrappedGlobalSelectors(t *testing.T) {
	html := `
		<style>
			:is(body, .hub-custom-page .hero) { overflow: hidden; }
			:where(a) { color: red; }
			:root { --page-bg: black; }
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "global")
}

func TestValidateAIDesignHTML_RejectsNamespaceQualifiedSelectors(t *testing.T) {
	html := `
		<style>
			svg|a { fill: red; }
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "namespace")
}

func TestValidateAIDesignHTML_RejectsBlocklessAtRules(t *testing.T) {
	html := `
		<style>
			@import url("https://example.com/theme.css");
			@charset "utf-8";
			@namespace svg url("http://www.w3.org/2000/svg");
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "at-rule")
}

func TestValidateAIDesignHTML_RejectsEOFBlocklessAtRuleWithoutSemicolon(t *testing.T) {
	html := `
		<style>
			@import url("https://example.com/theme.css")
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "at-rule")
}

func TestValidateAIDesignHTML_AllowsKeyframesInScopedStyles(t *testing.T) {
	html := `
		<style>
			.hub-custom-page .hero {
				animation: pulse 2s ease-in-out infinite;
			}

			@keyframes pulse {
				0% { opacity: 0.7; }
				100% { opacity: 1; }
			}

			@-webkit-keyframes pulse {
				0% { opacity: 0.7; }
				100% { opacity: 1; }
			}
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateAIDesignHTML_RejectsDuplicateSlots(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "exactly once")
}

func TestValidateAIDesignHTML_RejectsMissingSlots(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "exactly once")
}

func TestValidateAIDesignHTML_RejectsExtraTopLevelSiblingMarkup(t *testing.T) {
	html := `
		<div>extra sibling</div>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "single top-level")
}

func TestValidateAIDesignHTML_RejectsTopLevelTextOutsideRoot(t *testing.T) {
	html := `
		Leading prose
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "top-level")
}

func TestValidateAIDesignHTML_RejectsNestedHubCustomPageRoot(t *testing.T) {
	html := `
		<section>
			<div class="hub-custom-page">
				<div id="hub-join"></div>
				<div id="hub-create"></div>
				<div id="hub-mod"></div>
				<div id="hub-feed"></div>
			</div>
		</section>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "top-level")
}

func TestSanitizeAndValidateDesignHTML_ExtractsFencedHTMLFromProse(t *testing.T) {
	raw := "Here is the HTML:\n\n```html\n" +
		`<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
		<style>
			.hub-custom-page .hero { color: white; }
		</style>` +
		"\n```"

	clean, err := sanitizeAndValidateDesignHTML(raw, designHTMLValidationOptions{requireAllSlots: true})
	require.NoError(t, err)
	assert.NotContains(t, clean, "Here is the HTML:")
	assert.Contains(t, clean, `class="hub-custom-page"`)
}

func TestValidateManualDesignHTML_AllowsMissingSlots(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateManualDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateManualDesignHTML_RejectsDuplicateSlots(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-join"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateManualDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "duplicate")
}

func TestValidateManualDesignHTML_AllowsNonDeadAnchors(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<a href="https://example.com/archive">Legacy link</a>
			<div id="hub-join"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateManualDesignHTML(html)
	require.NoError(t, err)
}
