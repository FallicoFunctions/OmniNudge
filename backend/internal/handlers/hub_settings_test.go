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

var hubSettingsTestCounter int64

func uniqueHubSettingsName(base string) string {
	id := atomic.AddInt64(&hubSettingsTestCounter, 1)
	return fmt.Sprintf("%s_hs_%d_%d", base, time.Now().UnixNano(), id)
}

type hubSettingsTestFixture struct {
	handler        *HubSettingsHandler
	db             *database.Database
	ownerID        int
	nonModID       int
	nonModUsername string
	hubName        string
	hubID          int
	settingsRepo   *repository.HubSettingsRepository
	cleanup        func()
}

func setupHubSettingsHandlerTest(t *testing.T) *hubSettingsTestFixture {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)

	owner := &models.User{Username: uniqueHubSettingsName("owner"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, owner))

	nonModUsername := uniqueHubSettingsName("nonmod")
	nonMod := &models.User{Username: nonModUsername, PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, nonMod))

	hubRepo := models.NewHubRepository(db.Pool)
	hubName := uniqueHubSettingsName("hub")
	hub := &models.Hub{
		Name:           hubName,
		NameNormalized: hubName,
		Type:           "public",
		ContentOptions: "any",
		CreatedBy:      &owner.ID,
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	// Fetch the created hub to get its ID
	createdHub, err := hubRepo.GetByName(ctx, hubName)
	require.NoError(t, err)
	require.NotNil(t, createdHub)

	settingsRepo := repository.NewHubSettingsRepository(db.Pool)
	// Make owner a hub owner in hub_moderators
	require.NoError(t, settingsRepo.AddModerator(ctx, createdHub.ID, owner.ID, models.ModeratorRoleOwner))

	h := NewHubSettingsHandler(hubRepo, settingsRepo, userRepo)

	return &hubSettingsTestFixture{
		handler:        h,
		db:             db,
		ownerID:        owner.ID,
		nonModID:       nonMod.ID,
		nonModUsername: nonModUsername,
		hubName:        hubName,
		hubID:          createdHub.ID,
		settingsRepo:   settingsRepo,
		cleanup:        func() { db.Close() },
	}
}

func TestGetHubSettings(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name/settings", f.handler.GetHubSettings)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", fmt.Sprintf("/hubs/%s/settings", f.hubName), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGetHubSettings_NotFound(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name/settings", f.handler.GetHubSettings)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/hubs/nonexistenthub_xyz_12345/settings", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestUpdateHubSettings_OwnerCanUpdate(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/hubs/:name/settings", mockAuthMiddleware(f.ownerID), f.handler.UpdateHubSettings)

	body := map[string]interface{}{
		"hub_type":        "public",
		"content_options": "any",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", fmt.Sprintf("/hubs/%s/settings", f.hubName), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestUpdateHubSettings_NonModForbidden(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/hubs/:name/settings", mockAuthMiddleware(f.nonModID), f.handler.UpdateHubSettings)

	body := map[string]interface{}{"hub_type": "public"}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", fmt.Sprintf("/hubs/%s/settings", f.hubName), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetHubModerators(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name/moderators", f.handler.GetHubModerators)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", fmt.Sprintf("/hubs/%s/moderators", f.hubName), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	mods, ok := resp["moderators"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(mods), 1)
}

func TestAddHubModerator_OwnerCanAdd(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/moderators", mockAuthMiddleware(f.ownerID), f.handler.AddHubModerator)

	body := map[string]interface{}{
		"username": f.nonModUsername,
		"role":     "moderator",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", fmt.Sprintf("/hubs/%s/moderators", f.hubName), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAddHubModerator_NonModForbidden(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/moderators", mockAuthMiddleware(f.nonModID), f.handler.AddHubModerator)

	body := map[string]interface{}{
		"username": f.nonModUsername,
		"role":     "moderator",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", fmt.Sprintf("/hubs/%s/moderators", f.hubName), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestUpdateModeratorRole_RejectsUnsupportedRole(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()
	require.NoError(t, f.settingsRepo.AddModerator(context.Background(), f.hubID, f.nonModID, models.ModeratorRoleModerator))

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PATCH("/hubs/:name/moderators/:user_id", mockAuthMiddleware(f.ownerID), f.handler.UpdateModeratorRole)
	body := []byte(`{"role":"invalid"}`)
	request := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/hubs/%s/moderators/%d", f.hubName, f.nonModID), bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	assert.Equal(t, http.StatusBadRequest, response.Code)
}
