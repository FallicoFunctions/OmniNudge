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
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var themesTestCounter int64

func uniqueThemesUsername(base string) string {
	id := atomic.AddInt64(&themesTestCounter, 1)
	return fmt.Sprintf("%s_themes_%d_%d", base, time.Now().UnixNano(), id)
}

type themesTestFixture struct {
	handler    *ThemesHandler
	db         *database.Database
	userID     int
	otherID    int
	cleanup    func()
}

func setupThemesHandlerTest(t *testing.T) *themesTestFixture {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: uniqueThemesUsername("user"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user))

	other := &models.User{Username: uniqueThemesUsername("other"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, other))

	themeRepo := models.NewUserThemeRepository(db.Pool)
	themeOverrideRepo := models.NewUserThemeOverrideRepository(db.Pool)
	installedRepo := models.NewUserInstalledThemeRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	sanitizer := services.NewCSSSanitizer()

	h := NewThemesHandler(themeRepo, themeOverrideRepo, installedRepo, settingsRepo, sanitizer)

	return &themesTestFixture{
		handler: h,
		db:      db,
		userID:  user.ID,
		otherID: other.ID,
		cleanup: func() { db.Close() },
	}
}

func TestCreateTheme(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/themes", mockAuthMiddleware(f.userID), f.handler.CreateTheme)

	body := map[string]interface{}{
		"theme_name":    fmt.Sprintf("My Theme %d", time.Now().UnixNano()),
		"theme_type":    "variable_customization",
		"scope_type":    "global",
		"is_public":     false,
		"css_variables": map[string]interface{}{},
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/themes", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotNil(t, resp["id"])
}

func TestCreateTheme_InvalidType(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/themes", mockAuthMiddleware(f.userID), f.handler.CreateTheme)

	body := map[string]interface{}{
		"theme_name": "Bad Theme",
		"theme_type": "totally_invalid_type",
		"scope_type": "global",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/themes", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateTheme_MissingRequiredFields(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/themes", mockAuthMiddleware(f.userID), f.handler.CreateTheme)

	// Missing theme_name, theme_type, scope_type
	body := map[string]interface{}{}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/themes", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func createTestTheme(t *testing.T, f *themesTestFixture) int {
	t.Helper()
	ctx := context.Background()
	themeRepo := models.NewUserThemeRepository(f.db.Pool)
	theme, err := themeRepo.Create(ctx, &models.UserTheme{
		UserID:       f.userID,
		ThemeName:    fmt.Sprintf("TestTheme_%d", time.Now().UnixNano()),
		ThemeType:    "variable_customization",
		ScopeType:    "global",
		IsPublic:     false,
		Version:      "1.0.0",
		CSSVariables: map[string]interface{}{},
	})
	require.NoError(t, err)
	return theme.ID
}

func TestGetTheme(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	themeID := createTestTheme(t, f)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/themes/:id", mockAuthMiddleware(f.userID), f.handler.GetTheme)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", fmt.Sprintf("/themes/%d", themeID), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGetTheme_NotFound(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/themes/:id", mockAuthMiddleware(f.userID), f.handler.GetTheme)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/themes/999999999", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestDeleteTheme_OwnerCanDelete(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	themeID := createTestTheme(t, f)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.DELETE("/themes/:id", mockAuthMiddleware(f.userID), f.handler.DeleteTheme)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", fmt.Sprintf("/themes/%d", themeID), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDeleteTheme_NonOwnerForbidden(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	themeID := createTestTheme(t, f)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	// otherID trying to delete userID's theme
	router.DELETE("/themes/:id", mockAuthMiddleware(f.otherID), f.handler.DeleteTheme)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", fmt.Sprintf("/themes/%d", themeID), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetPredefinedThemes(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/themes/predefined", f.handler.GetPredefinedThemes)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/themes/predefined", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	_, hasThemes := resp["themes"]
	assert.True(t, hasThemes)
}

func TestGetMyThemes(t *testing.T) {
	f := setupThemesHandlerTest(t)
	defer f.cleanup()

	_ = createTestTheme(t, f)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/themes/mine", mockAuthMiddleware(f.userID), f.handler.GetMyThemes)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/themes/mine", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	themes, ok := resp["themes"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(themes), 1)
}
