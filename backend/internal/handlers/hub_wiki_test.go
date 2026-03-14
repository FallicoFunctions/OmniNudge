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

var hubWikiCounter int64

func uniqueHubWikiName(base string) string {
	id := atomic.AddInt64(&hubWikiCounter, 1)
	return fmt.Sprintf("%s_wiki_%d_%d", base, time.Now().UnixNano(), id)
}

type hubWikiTestFixture struct {
	handler   *HubWikiHandler
	hubName   string
	hubID     int
	ownerID   int
	nonModID  int
	cleanup   func()
}

func setupHubWikiTest(t *testing.T) *hubWikiTestFixture {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: uniqueHubWikiName("owner"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, owner))
	nonMod := &models.User{Username: uniqueHubWikiName("nonmod"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, nonMod))

	hubRepo := models.NewHubRepository(db.Pool)
	hubName := uniqueHubWikiName("hub")
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

	// Enable wiki for hub
	settings, err := settingsRepo.GetByHubID(ctx, createdHub.ID)
	if err != nil {
		// If no settings yet, create defaults
		allowText, allowLink, allowImage, allowVideo := mapContentOptions(hub.ContentOptions)
		defaults := buildDefaultHubSettings(createdHub.ID, hub.Type, allowText, allowLink, allowImage, allowVideo)
		defaults.EnableWiki = true
		require.NoError(t, settingsRepo.EnsureDefaults(ctx, defaults, &owner.ID))
	} else {
		settings.EnableWiki = true
		require.NoError(t, settingsRepo.Update(ctx, settings, owner.ID))
	}

	wikiRepo := repository.NewHubWikiRepository(db.Pool)
	handler := NewHubWikiHandler(hubRepo, settingsRepo, wikiRepo)

	return &hubWikiTestFixture{
		handler:  handler,
		hubName:  hubName,
		hubID:    createdHub.ID,
		ownerID:  owner.ID,
		nonModID: nonMod.ID,
		cleanup:  func() { db.Close() },
	}
}

func TestGetWikiPage(t *testing.T) {
	f := setupHubWikiTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name/wiki/:pagePath", f.handler.GetHubWikiPage)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/hubs/"+f.hubName+"/wiki/index", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGetWikiPage_NotFound(t *testing.T) {
	f := setupHubWikiTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name/wiki/:pagePath", f.handler.GetHubWikiPage)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/hubs/nonexistenthub99999/wiki/index", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestCreateWikiPage(t *testing.T) {
	f := setupHubWikiTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/hubs/:name/wiki/:pagePath", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.UpdateHubWikiPage(c)
	})

	body, _ := json.Marshal(map[string]string{"content": "# Welcome to the wiki!"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/hubs/"+f.hubName+"/wiki/index", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestCreateWikiPage_NonMod(t *testing.T) {
	f := setupHubWikiTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/hubs/:name/wiki/:pagePath", func(c *gin.Context) {
		c.Set("user_id", f.nonModID)
		f.handler.UpdateHubWikiPage(c)
	})

	body, _ := json.Marshal(map[string]string{"content": "# Unauthorized edit"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/hubs/"+f.hubName+"/wiki/index", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestUpdateWikiPage(t *testing.T) {
	f := setupHubWikiTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/hubs/:name/wiki/:pagePath", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.UpdateHubWikiPage(c)
	})

	// Create first
	body, _ := json.Marshal(map[string]string{"content": "# Original content"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/hubs/"+f.hubName+"/wiki/mypage", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	// Update
	body2, _ := json.Marshal(map[string]string{"content": "# Updated content"})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPut, "/hubs/"+f.hubName+"/wiki/mypage", bytes.NewBuffer(body2))
	req2.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
}

func TestDeleteWikiPage_NonMod(t *testing.T) {
	f := setupHubWikiTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	// Reuse UpdateHubWikiPage as "delete" by setting content empty; non-mod should get 403
	router.PUT("/hubs/:name/wiki/:pagePath", func(c *gin.Context) {
		c.Set("user_id", f.nonModID)
		f.handler.UpdateHubWikiPage(c)
	})

	body, _ := json.Marshal(map[string]string{"content": ""})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/hubs/"+f.hubName+"/wiki/index", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}
