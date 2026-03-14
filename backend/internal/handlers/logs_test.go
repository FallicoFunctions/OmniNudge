package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupLogsRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewLogHandler(nil) // nil analytics is fine for unit tests
	r := gin.New()
	r.POST("/logs/frontend", handler.HandleFrontendLogs)
	return r
}

func TestFrontendLog_Success(t *testing.T) {
	router := setupLogsRouter()

	body, _ := json.Marshal(map[string]interface{}{
		"level":   "error",
		"message": "Something went wrong",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/logs/frontend", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.1:1234"
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "logged", resp["status"])
}

func TestFrontendLog_MissingMessage(t *testing.T) {
	router := setupLogsRouter()

	body, _ := json.Marshal(map[string]interface{}{
		"level": "error",
		// message deliberately omitted
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/logs/frontend", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.2:1234"
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestFrontendLog_InvalidLevel(t *testing.T) {
	router := setupLogsRouter()

	body, _ := json.Marshal(map[string]interface{}{
		"level":   "debug", // only warn/error accepted
		"message": "A debug message",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/logs/frontend", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.3:1234"
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestFrontendLog_MessageTooLong(t *testing.T) {
	router := setupLogsRouter()

	longMessage := strings.Repeat("x", 3000)
	body, _ := json.Marshal(map[string]interface{}{
		"level":   "warn",
		"message": longMessage,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/logs/frontend", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.4:1234"
	router.ServeHTTP(w, req)
	// Long message is truncated but request succeeds
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestFrontendLog_WarnLevelAccepted(t *testing.T) {
	router := setupLogsRouter()

	body, _ := json.Marshal(map[string]interface{}{
		"level":   "warn",
		"message": "A warning message",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/logs/frontend", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.5:1234"
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestFrontendLog_RateLimit(t *testing.T) {
	// Use a unique IP to avoid interference from other tests
	gin.SetMode(gin.TestMode)
	handler := NewLogHandler(nil)
	r := gin.New()
	r.POST("/logs/frontend", handler.HandleFrontendLogs)

	// The limiter allows burst=10, so send 15 requests rapidly from same IP
	// At least some should succeed and eventually hit 429
	hitRateLimit := false
	ip := "10.255.0.1:9999"
	for i := 0; i < 15; i++ {
		body, _ := json.Marshal(map[string]interface{}{
			"level":   "error",
			"message": "rate limit test",
		})
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodPost, "/logs/frontend", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = ip
		r.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			hitRateLimit = true
			break
		}
	}
	assert.True(t, hitRateLimit, "rapid requests from same IP should eventually hit rate limit")
}
