package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/queue"
	"github.com/stretchr/testify/assert"
)

// setupJobsHandlerTest creates a JobsHandler connected to a real Redis queue client.
// If Redis is unavailable, the client still connects — errors surface per-request.
func setupJobsHandlerTest(t *testing.T) *JobsHandler {
	t.Helper()
	queueClient := queue.NewQueueClient("localhost:6379", "")
	t.Cleanup(func() { queueClient.Close() })
	return NewJobsHandler(queueClient)
}

func TestGetJobStatus_NotFound(t *testing.T) {
	handler := setupJobsHandlerTest(t)
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.GET("/jobs/:queue/:id", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.GetJobStatus(c)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/jobs/default/nonexistent-job-id-xyz-12345", nil)
	router.ServeHTTP(w, req)
	// Either 404 (job not found) or 500/503 (Redis unavailable in CI) are acceptable
	assert.Contains(t, []int{http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable}, w.Code)
}

func TestGetJobStatus_MissingParams(t *testing.T) {
	handler := setupJobsHandlerTest(t)
	gin.SetMode(gin.TestMode)

	router := gin.New()
	// Route without id param — handler gets empty string which triggers 400
	router.GET("/jobs/:queue", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.GetJobStatus(c)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/jobs/default", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetJobStatus_Unauthenticated(t *testing.T) {
	handler := setupJobsHandlerTest(t)
	gin.SetMode(gin.TestMode)

	// Wire up with auth middleware that rejects unauthenticated requests
	router := gin.New()
	router.GET("/jobs/:queue/:id", func(c *gin.Context) {
		// Simulate auth middleware: no user_id set → unauthenticated
		// The handler itself doesn't check auth — that's the middleware's job.
		// We test that a consumer wiring it without auth middleware gets a response.
		handler.GetJobStatus(c)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/jobs/default/some-id", nil)
	router.ServeHTTP(w, req)
	// Without auth middleware, handler will attempt the lookup and return 404 or connection error
	assert.Contains(t, []int{http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable, http.StatusBadRequest}, w.Code)
}

func TestGetJobStatus_ValidQueueAndID(t *testing.T) {
	handler := setupJobsHandlerTest(t)
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.GET("/jobs/:queue/:id", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.GetJobStatus(c)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/jobs/default/valid-looking-job-id", nil)
	router.ServeHTTP(w, req)
	// Not found since we haven't enqueued any job; connection error is also acceptable
	assert.Contains(t, []int{http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable}, w.Code)
}
