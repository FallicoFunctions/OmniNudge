package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

// ensure BanEnforcement blocks banned users with reason
func TestBanEnforcement_Banned(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := &fakeRepo{status: &models.BanStatus{Banned: true, BanReason: strPtr("test ban"), ShowBanReason: true}}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Set("user_id", 1)

	handler := BanEnforcement(repo)
	handler(c)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
	if body := w.Body.String(); !contains(body, "test ban") {
		t.Fatalf("expected ban reason in response, got %s", body)
	}
}

// ensure shadow-banned users pass through with flag set
func TestBanEnforcement_ShadowBanned(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := &fakeRepo{status: &models.BanStatus{ShadowBanned: true}}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Set("user_id", 1)

	handler := BanEnforcement(repo)
	handler(c)

	if c.IsAborted() {
		t.Fatal("shadow-banned user should not be aborted")
	}
	if !c.GetBool("shadow_banned") {
		t.Fatal("shadow_banned flag not set")
	}
}

// --- helpers ---

type fakeRepo struct {
	status *models.BanStatus
	err    error
}

func (f *fakeRepo) GetBanStatus(ctx context.Context, userID int) (*models.BanStatus, error) {
	return f.status, f.err
}

func strPtr(s string) *string { return &s }

func contains(haystack, needle string) bool {
	return strings.Contains(haystack, needle)
}
