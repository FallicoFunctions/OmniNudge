package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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

var hubThemesCounter int64

func uniqueHubThemeName(base string) string {
	id := atomic.AddInt64(&hubThemesCounter, 1)
	return fmt.Sprintf("%s_theme_%d_%d", base, time.Now().UnixNano(), id)
}

type hubThemesTestFixture struct {
	handler  *HubThemesHandler
	hubName  string
	hubID    int
	ownerID  int
	nonModID int
	cleanup  func()
}

func setupHubThemesTest(t *testing.T) *hubThemesTestFixture {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: uniqueHubThemeName("owner"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, owner))
	nonMod := &models.User{Username: uniqueHubThemeName("nonmod"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, nonMod))

	hubRepo := models.NewHubRepository(db.Pool)
	hubName := uniqueHubThemeName("hub")
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

	// Ensure hub settings exist
	allowText, allowLink, allowImage, allowVideo := mapContentOptions(hub.ContentOptions)
	defaults := buildDefaultHubSettings(createdHub.ID, hub.Type, allowText, allowLink, allowImage, allowVideo)
	_ = settingsRepo.EnsureDefaults(ctx, defaults, &owner.ID)

	themesRepo := repository.NewHubThemesRepository(db.Pool)
	handler := NewHubThemesHandler(themesRepo, settingsRepo)

	return &hubThemesTestFixture{
		handler:  handler,
		hubName:  hubName,
		hubID:    createdHub.ID,
		ownerID:  owner.ID,
		nonModID: nonMod.ID,
		cleanup:  func() { db.Close() },
	}
}

func TestGetHubTheme(t *testing.T) {
	f := setupHubThemesTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name/theme", f.handler.GetActiveTheme)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/hubs/"+f.hubName+"/theme", nil)
	router.ServeHTTP(w, req)
	// 404 is expected when no active theme exists — endpoint is reachable
	assert.Contains(t, []int{http.StatusOK, http.StatusNotFound}, w.Code)
}

func TestUpdateHubTheme(t *testing.T) {
	f := setupHubThemesTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/themes", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.CreateTheme(c)
	})

	body, _ := json.Marshal(map[string]interface{}{
		"name":            "My Theme",
		"primary_color":   "#3b82f6",
		"secondary_color": "#1e40af",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/themes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
}

func TestUpdateHubTheme_NonOwner(t *testing.T) {
	f := setupHubThemesTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/themes", func(c *gin.Context) {
		c.Set("user_id", f.nonModID)
		f.handler.CreateTheme(c)
	})

	body, _ := json.Marshal(map[string]interface{}{
		"name":          "Unauthorized Theme",
		"primary_color": "#ff0000",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/themes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestResetHubTheme(t *testing.T) {
	f := setupHubThemesTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)

	// Create a theme first
	createRouter := gin.New()
	createRouter.POST("/hubs/:name/themes", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.CreateTheme(c)
	})
	body, _ := json.Marshal(map[string]interface{}{"name": "Reset Theme", "primary_color": "#aabbcc"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/themes", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	createRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var created map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	themeIDFloat, ok := created["theme_id"].(float64)
	require.True(t, ok)
	themeID := int(themeIDFloat)

	// Delete the theme (reset)
	deleteRouter := gin.New()
	deleteRouter.DELETE("/hubs/:name/themes/:id", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.DeleteTheme(c)
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodDelete, fmt.Sprintf("/hubs/%s/themes/%d", f.hubName, themeID), nil)
	deleteRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
}
