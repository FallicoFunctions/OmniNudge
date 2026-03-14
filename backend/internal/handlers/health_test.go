package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupHealthHandlerTest(t *testing.T) (*HealthHandler, func()) {
	t.Helper()

	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// HealthHandler with real DB pool, no Redis (nil is allowed)
	handler := NewHealthHandler(db.Pool, nil)

	cleanup := func() {
		db.Close()
	}
	return handler, cleanup
}

func TestHealthCheck(t *testing.T) {
	testCases := []struct {
		name               string
		useNilDB           bool
		expectedStatus     int
		expectedHealthy    bool
	}{
		{
			name:            "healthy with real db",
			useNilDB:        false,
			expectedStatus:  http.StatusOK,
			expectedHealthy: true,
		},
		{
			name:            "nil db — no services checked — returns healthy shell",
			useNilDB:        true,
			expectedStatus:  http.StatusOK,
			expectedHealthy: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var handler *HealthHandler
			var cleanup func()
			if tc.useNilDB {
				handler = NewHealthHandler(nil, nil)
				cleanup = func() {}
			} else {
				handler, cleanup = setupHealthHandlerTest(t)
			}
			defer cleanup()

			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.GET("/health", handler.HealthCheck)

			req := httptest.NewRequest(http.MethodGet, "/health", nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			var body map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &body)
			require.NoError(t, err)

			assert.Contains(t, body, "status")
			assert.Contains(t, body, "version")
			assert.Contains(t, body, "timestamp")
			assert.Contains(t, body, "services")

			if tc.expectedHealthy {
				assert.Equal(t, "healthy", body["status"])
			}
		})
	}
}

// TestHealthCheck_DegradedService verifies that HealthCheck returns 503 when
// a dependency (database) is unhealthy/degraded. We can simulate this by
// closing the pool after setup so the ping will fail.
func TestHealthCheck_DegradedService(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Close pool immediately — next ping will fail, triggering "degraded" path
	pool := db.Pool
	db.Close()

	handler := NewHealthHandler(pool, nil)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/health", handler.HealthCheck)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Degraded/unhealthy services must return 503
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var body map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &body)
	require.NoError(t, err)

	status, _ := body["status"].(string)
	assert.NotEqual(t, "healthy", status, "degraded handler must not report healthy")
}

func TestLivenessProbe(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHealthHandler(nil, nil)

	router := gin.New()
	router.GET("/health/liveness", handler.LivenessProbe)

	req := httptest.NewRequest(http.MethodGet, "/health/liveness", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var body map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, "alive", body["status"])
	assert.Contains(t, body, "time")
}

func TestReadinessProbe(t *testing.T) {
	testCases := []struct {
		name           string
		useNilDB       bool
		expectedStatus int
		expectedReady  bool
	}{
		{
			name:           "ready with real db",
			useNilDB:       false,
			expectedStatus: http.StatusOK,
			expectedReady:  true,
		},
		{
			name:           "nil db — not configured — still considered ready",
			useNilDB:       true,
			expectedStatus: http.StatusOK,
			expectedReady:  true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var handler *HealthHandler
			var cleanup func()
			if tc.useNilDB {
				handler = NewHealthHandler(nil, nil)
				cleanup = func() {}
			} else {
				handler, cleanup = setupHealthHandlerTest(t)
			}
			defer cleanup()

			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.GET("/health/readiness", handler.ReadinessProbe)

			req := httptest.NewRequest(http.MethodGet, "/health/readiness", nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			var body map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &body)
			require.NoError(t, err)
			assert.Contains(t, body, "status")

			statusObj, ok := body["status"].(map[string]interface{})
			require.True(t, ok, "status field should be an object")
			assert.Equal(t, tc.expectedReady, statusObj["ready"])
		})
	}
}

// TestReadinessProbe_UnhealthyDB verifies that ReadinessProbe returns 503 when
// the database cannot be pinged.
func TestReadinessProbe_UnhealthyDB(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	pool := db.Pool
	db.Close() // force ping failure

	handler := NewHealthHandler(pool, nil)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/health/readiness", handler.ReadinessProbe)

	req := httptest.NewRequest(http.MethodGet, "/health/readiness", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var body map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &body)
	require.NoError(t, err)

	statusObj, ok := body["status"].(map[string]interface{})
	require.True(t, ok, "status field should be an object")
	assert.Equal(t, false, statusObj["ready"])
}
