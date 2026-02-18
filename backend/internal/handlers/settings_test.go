package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupSettingsHandlerTest(t *testing.T) (*SettingsHandler, *models.UserSettingsRepository, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueConversationsUsername("settings_user"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	handler := NewSettingsHandler(settingsRepo)

	cleanup := func() {
		db.Close()
	}
	return handler, settingsRepo, user.ID, cleanup
}

func TestUpdateSettings_RejectsInvalidFontSize(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"font_size": "xlarge",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid font_size")
}

func TestGetSettings_CreatesDefaultSettingsWhenMissing(t *testing.T) {
	handler, settingsRepo, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	// New test users start without a user_settings row.
	existing, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.Nil(t, existing)

	router := gin.Default()
	router.GET("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.GetSettings(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/settings", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	settings, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.Equal(t, userID, settings.UserID)
}

func TestGetSettings_RequiresAuth(t *testing.T) {
	handler, _, _, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/settings", handler.GetSettings)

	req := httptest.NewRequest(http.MethodGet, "/settings", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "Not authenticated")
}

func TestUpdateSettings_RejectsTooLongDeviceID(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"mic_device_id": strings.Repeat("a", 256),
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid mic_device_id")
}

func TestUpdateSettings_PersistsDeviceIDs(t *testing.T) {
	handler, settingsRepo, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"mic_device_id":     "mic-1",
		"camera_device_id":  "cam-1",
		"speaker_device_id": "spk-1",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	settings, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.Equal(t, "mic-1", settings.MicDeviceID)
	assert.Equal(t, "cam-1", settings.CameraDeviceID)
	assert.Equal(t, "spk-1", settings.SpeakerDeviceID)
}

func TestUpdateSettings_RejectsInvalidQuietHoursTimezone(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"quiet_hours_timezone": "Not/A_Real_Timezone",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid quiet_hours_timezone")
}

func TestUpdateSettings_RejectsInvalidQuietHoursStartMinutesRange(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"quiet_hours_start_minutes": 1440,
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid quiet_hours_start_minutes")
}

func TestUpdateSettings_RejectsInvalidQuietHoursEndMinutesRange(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"quiet_hours_end_minutes": -1,
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid quiet_hours_end_minutes")
}

func TestUpdateSettings_RejectsInvalidProfileVisibility(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"profile_visibility": "team_only",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid profile_visibility")
}

func TestUpdateSettings_PersistsProfileVisibility(t *testing.T) {
	handler, settingsRepo, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"profile_visibility": "friends_only",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	settings, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.Equal(t, "friends_only", settings.ProfileVisibility)
}

func TestUpdateSettings_RejectsQuietHoursWithSameStartAndEndWhenEnabled(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"quiet_hours_enabled":       true,
		"quiet_hours_start_minutes": 480,
		"quiet_hours_end_minutes":   480,
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(
		t,
		w.Body.String(),
		"quiet_hours_start_minutes and quiet_hours_end_minutes must differ",
	)
}

func TestUpdateSettings_AllowsQuietHoursWithSameStartAndEndWhenDisabled(t *testing.T) {
	handler, settingsRepo, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"quiet_hours_enabled":       false,
		"quiet_hours_start_minutes": 480,
		"quiet_hours_end_minutes":   480,
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	settings, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.False(t, settings.QuietHoursEnabled)
	assert.Equal(t, 480, settings.QuietHoursStartMinutes)
	assert.Equal(t, 480, settings.QuietHoursEndMinutes)
}

func TestUpdateSettings_AcceptsThemeAutoAlias(t *testing.T) {
	handler, settingsRepo, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"theme": "auto",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	settings, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.Equal(t, "system", settings.Theme)
}

func TestUpdateSettings_RejectsInvalidTheme(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"theme": "neon",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid theme")
}

func TestUpdateSettings_RejectsInvalidAccessRequestCooldownDisplay(t *testing.T) {
	handler, _, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"access_request_cooldown_display": "countdown",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid access_request_cooldown_display")
}

func TestUpdateSettings_PersistsAccessRequestCooldownDisplay(t *testing.T) {
	handler, settingsRepo, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"access_request_cooldown_display": "both",
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	settings, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.Equal(t, "both", settings.AccessRequestCooldownDisplay)
}

func TestUpdateSettings_PersistsShowPushNotifications(t *testing.T) {
	handler, settingsRepo, userID, cleanup := setupSettingsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.PUT("/settings", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateSettings(c)
	})

	body := map[string]any{
		"show_push_notifications": false,
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPut, "/settings", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	settings, err := settingsRepo.GetByUserID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, settings)
	assert.False(t, settings.ShowPushNotifications)
}
