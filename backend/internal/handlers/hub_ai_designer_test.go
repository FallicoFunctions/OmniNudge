package handlers

import (
	"context"
	"encoding/json"
	"fmt"
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
