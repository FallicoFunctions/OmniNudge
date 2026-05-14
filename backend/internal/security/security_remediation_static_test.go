package security

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	return filepath.Clean(filepath.Join("..", ".."))
}

func readRepoFile(t *testing.T, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(repoRoot(t), rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return string(b)
}

func TestSecurityRemediationBackendStatic(t *testing.T) {
	users := readRepoFile(t, "internal/handlers/users.go")
	for _, forbidden := range []string{`c.GetInt("user_id")`, "bcrypt.DefaultCost"} {
		if strings.Contains(users, forbidden) {
			t.Fatalf("users.go still contains %s", forbidden)
		}
	}
	for _, required := range []string{"bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)", "IncrementTokenVersion(c.Request.Context(), userID)"} {
		if !strings.Contains(users, required) {
			t.Fatalf("users.go missing %s", required)
		}
	}

	designer := readRepoFile(t, "internal/handlers/hub_ai_designer.go")
	for _, required := range []string{"reStyleJavascriptURI", "reLegacyCSSAttack", "<hub_data>", "</hub_data>", "Design validation failed. Please try again."} {
		if !strings.Contains(designer, required) {
			t.Fatalf("hub_ai_designer.go missing %s", required)
		}
	}

	moderation := readRepoFile(t, "internal/handlers/moderation_v2.go")
	if count := strings.Count(moderation, "Not a moderator of this post's hub"); count < 8 {
		t.Fatalf("expected at least 8 moderation hub cross-checks, got %d", count)
	}
	if strings.Contains(moderation, "RespondError(c, http.StatusInternalServerError, err.Error())") {
		t.Fatal("moderation_v2.go still returns raw 5xx errors")
	}

	rateLimit := readRepoFile(t, "internal/api/middleware/redis_rate_limit.go")
	for _, required := range []string{"func AIDesignRateLimiter(cache services.Cache) *RedisRateLimiter", "func ChatDesignRateLimiter(cache services.Cache) *RedisRateLimiter", `"rate:ai_design_chat"`} {
		if !strings.Contains(rateLimit, required) {
			t.Fatalf("redis_rate_limit.go missing %s", required)
		}
	}

	securityHeaders := readRepoFile(t, "internal/api/middleware/security.go")
	if strings.Contains(securityHeaders, "func CSRFProtection()") {
		t.Fatal("CSRFProtection still exists")
	}
	if !strings.Contains(securityHeaders, `os.Getenv("APP_ENV") == "production"`) {
		t.Fatal("production CSP environment check missing")
	}

	authMiddleware := readRepoFile(t, "internal/api/middleware/auth.go")
	for _, required := range []string{"isValidWebSocketToken", `claims.Use == "ws"`, "5*time.Minute"} {
		if !strings.Contains(authMiddleware, required) {
			t.Fatalf("auth middleware missing %s", required)
		}
	}

	authHandler := readRepoFile(t, "internal/handlers/auth.go")
	if !strings.Contains(authHandler, "func (h *AuthHandler) GenerateWSToken") || !strings.Contains(authHandler, `"ws_token"`) {
		t.Fatal("GenerateWSToken handler missing")
	}
}
