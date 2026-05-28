package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestGetOrCreateSessionID_MarksCookieSecureBehindTLSProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Request.Header.Set("X-Forwarded-Proto", "https")

	_ = getOrCreateSessionID(c)

	setCookie := w.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, "Secure") {
		t.Fatalf("expected proxied HTTPS session cookie to be Secure, got %q", setCookie)
	}
}

func TestGetOrCreateSessionID_DoesNotMarkPlainHTTPCookieSecure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)

	_ = getOrCreateSessionID(c)

	setCookie := w.Header().Get("Set-Cookie")
	if strings.Contains(setCookie, "Secure") {
		t.Fatalf("expected plain HTTP session cookie not to be Secure, got %q", setCookie)
	}
}
