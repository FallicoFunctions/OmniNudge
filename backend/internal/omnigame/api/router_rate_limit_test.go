package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	servicemocks "github.com/omninudge/backend/internal/services/mocks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestLimitCache gives a router its own sign-in counts, stopped with the test.
func newTestLimitCache(t *testing.T) services.Cache {
	t.Helper()
	cache := services.NewMemoryCache()
	t.Cleanup(cache.Stop)
	return cache
}

// The runtime signs in against the same accounts as the main API and carries
// the main API's limit: five attempts, then 429. Pre-login keeps its own count.
func TestRuntimeSignInIsRateLimited(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	authService.SetUserRepository(servicemocks.NewUserRepository())
	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)
	router := NewRouter(sessionService, authService, nil, nil, nil, nil, nil, newTestLimitCache(t))

	post := func(path, body string) int {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "203.0.113.9:40000"
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}

	var codes []int
	for i := 0; i < 6; i++ {
		codes = append(codes, post("/api/v1/omnigame/runtime/auth/login", `{"username":"nobody","password":"wrong-password"}`))
	}
	require.Equal(t, []int{401, 401, 401, 401, 401, 429}, codes)

	assert.Equal(t, http.StatusOK, post("/api/v1/omnigame/runtime/auth/prelogin", `{"username":"nobody"}`),
		"pre-login keeps its own count")
}
