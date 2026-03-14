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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var pushTestCounter int64

func uniquePushUsername(base string) string {
	id := atomic.AddInt64(&pushTestCounter, 1)
	return fmt.Sprintf("%s_push_%d_%d", base, time.Now().UnixNano(), id)
}

func setupPushNotificationHandlerTest(t *testing.T) (*PushNotificationHandler, *database.Database, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniquePushUsername("user"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	tokenRepo := models.NewDeviceTokenRepository(db.Pool)
	handler := NewPushNotificationHandler(db.Pool, tokenRepo, nil)

	cleanup := func() { db.Close() }
	return handler, db, user.ID, cleanup
}

func TestRegisterDevice(t *testing.T) {
	handler, _, userID, cleanup := setupPushNotificationHandlerTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/devices/register", mockAuthMiddleware(userID), handler.RegisterDeviceToken)

	body := map[string]interface{}{
		"token":       fmt.Sprintf("device_token_%d", time.Now().UnixNano()),
		"device_type": "web",
		"device_name": "My Browser",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/devices/register", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "registered", resp["status"])
}

func TestRegisterDevice_Unauthenticated(t *testing.T) {
	handler, _, _, cleanup := setupPushNotificationHandlerTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	// No auth middleware — user_id defaults to 0
	router.POST("/devices/register", handler.RegisterDeviceToken)

	body := map[string]interface{}{
		"token":       "some_token",
		"device_type": "ios",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/devices/register", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	// Without auth middleware user_id defaults to 0. The handler should return
	// either 401 (if the handler checks auth itself) or 400/500 (DB FK violation).
	// It must not return 200 since no valid user is associated.
	assert.NotEqual(t, http.StatusOK, w.Code,
		"unauthenticated register should not succeed; got: %s", w.Body.String())
}

func TestRegisterDevice_InvalidPlatform(t *testing.T) {
	handler, _, userID, cleanup := setupPushNotificationHandlerTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/devices/register", mockAuthMiddleware(userID), handler.RegisterDeviceToken)

	body := map[string]interface{}{
		"token":       "some_token",
		"device_type": "windowsphone", // not in oneof=web ios android
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/devices/register", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestRegisterDevice_MissingToken(t *testing.T) {
	handler, _, userID, cleanup := setupPushNotificationHandlerTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/devices/register", mockAuthMiddleware(userID), handler.RegisterDeviceToken)

	body := map[string]interface{}{
		"device_type": "ios",
		// token missing
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/devices/register", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestUnregisterDevice(t *testing.T) {
	handler, _, userID, cleanup := setupPushNotificationHandlerTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)

	// First register a device
	registerRouter := gin.New()
	registerRouter.POST("/devices/register", mockAuthMiddleware(userID), handler.RegisterDeviceToken)
	token := fmt.Sprintf("unregister_token_%d", time.Now().UnixNano())
	regBody := map[string]interface{}{"token": token, "device_type": "android"}
	regBodyJSON, _ := json.Marshal(regBody)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/devices/register", bytes.NewBuffer(regBodyJSON))
	req.Header.Set("Content-Type", "application/json")
	registerRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	// Now unregister
	router := gin.New()
	router.DELETE("/devices/unregister", mockAuthMiddleware(userID), handler.UnregisterDeviceToken)
	body := map[string]interface{}{"token": token}
	bodyJSON, _ := json.Marshal(body)
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("DELETE", "/devices/unregister", bytes.NewBuffer(bodyJSON))
	req2.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusOK, w2.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, "unregistered", resp["status"])
}

func TestListDevices(t *testing.T) {
	handler, _, userID, cleanup := setupPushNotificationHandlerTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)

	// Register two devices
	registerRouter := gin.New()
	registerRouter.POST("/devices/register", mockAuthMiddleware(userID), handler.RegisterDeviceToken)
	for i, dt := range []string{"ios", "android"} {
		tok := fmt.Sprintf("list_token_%d_%d", i, time.Now().UnixNano())
		regBody := map[string]interface{}{"token": tok, "device_type": dt}
		regBodyJSON, _ := json.Marshal(regBody)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/devices/register", bytes.NewBuffer(regBodyJSON))
		req.Header.Set("Content-Type", "application/json")
		registerRouter.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)
	}

	router := gin.New()
	router.GET("/devices", mockAuthMiddleware(userID), handler.GetUserDevices)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/devices", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	devices, ok := resp["devices"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(devices), 2)
}

func TestListDevices_Empty(t *testing.T) {
	handler, _, userID, cleanup := setupPushNotificationHandlerTest(t)
	defer cleanup()

	// Use a separate new user with no devices
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/devices", mockAuthMiddleware(userID), handler.GetUserDevices)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/devices", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	devices := resp["devices"]
	// Should be null or empty array
	if devices != nil {
		arr, ok := devices.([]interface{})
		assert.True(t, ok)
		assert.Empty(t, arr)
	}
}
