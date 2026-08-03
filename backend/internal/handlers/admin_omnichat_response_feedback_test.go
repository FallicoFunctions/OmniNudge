package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type adminFeedbackStoreFake struct {
	item          *models.OmniChatResponseFeedbackAdminDetail
	status        models.OmniChatResponseFeedbackStatus
	transitionErr error
}

func (f *adminFeedbackStoreFake) ListForAdmin(context.Context, *models.OmniChatResponseFeedbackStatus, *models.OmniChatResponseFeedbackReason, int, int) ([]*models.OmniChatResponseFeedbackAdminSummary, int, error) {
	return []*models.OmniChatResponseFeedbackAdminSummary{{ID: f.item.ID, Reason: f.item.Reason, Status: f.item.Status}}, 1, nil
}
func (f *adminFeedbackStoreFake) GetForAdmin(context.Context, uuid.UUID) (*models.OmniChatResponseFeedbackAdminDetail, error) {
	return f.item, nil
}
func (f *adminFeedbackStoreFake) TransitionStatusForAdmin(_ context.Context, _ uuid.UUID, status models.OmniChatResponseFeedbackStatus) (*models.OmniChatResponseFeedbackAdminDetail, error) {
	if f.transitionErr != nil {
		return nil, f.transitionErr
	}
	f.status = status
	f.item.Status = status
	return f.item, nil
}

func TestAdminOmniChatResponseFeedbackRoutesRequireAdminAndDecodeStrictly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	item := &models.OmniChatResponseFeedbackAdminDetail{ID: uuid.New(), Reason: models.OmniChatFeedbackUserAgency, Status: models.OmniChatFeedbackStatusNew, ResponseSnapshot: "stored response", SceneStateSnapshot: []byte(`{"location":"library"}`)}
	store := &adminFeedbackStoreFake{item: item}
	handler := NewAdminOmniChatResponseFeedbackHandler(store)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("role", c.GetHeader("X-Test-Role")); c.Next() })
	admin := router.Group("/admin")
	admin.Use(middleware.RequireRole("admin"))
	admin.GET("/omnichat/response-feedback", handler.List)
	admin.PATCH("/omnichat/response-feedback/:id/status", handler.Transition)

	req := httptest.NewRequest(http.MethodGet, "/admin/omnichat/response-feedback", nil)
	req.Header.Set("X-Test-Role", "user")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusForbidden, w.Code)
	req = httptest.NewRequest(http.MethodPatch, "/admin/omnichat/response-feedback/"+item.ID.String()+"/status", strings.NewReader(`{"status":"reviewed","extra":true}`))
	req.Header.Set("X-Test-Role", "admin")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
	req = httptest.NewRequest(http.MethodPatch, "/admin/omnichat/response-feedback/"+item.ID.String()+"/status", strings.NewReader(`{"status":"reviewed"}`))
	req.Header.Set("X-Test-Role", "admin")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, models.OmniChatFeedbackStatusReviewed, store.status)
	require.NotContains(t, w.Body.String(), "system_prompt")
}

func TestAdminOmniChatResponseFeedbackRejectsInvalidFiltersAndConflictingTransition(t *testing.T) {
	item := &models.OmniChatResponseFeedbackAdminDetail{
		ID: uuid.New(), Reason: models.OmniChatFeedbackUserAgency, Status: models.OmniChatFeedbackStatusReviewed,
	}
	store := &adminFeedbackStoreFake{item: item, transitionErr: models.ErrOmniChatResponseFeedbackInvalidTransition}
	handler := NewAdminOmniChatResponseFeedbackHandler(store)
	router := gin.New()
	router.GET("/admin/omnichat/response-feedback", handler.List)
	router.PATCH("/admin/omnichat/response-feedback/:id/status", handler.Transition)

	req := httptest.NewRequest(http.MethodGet, "/admin/omnichat/response-feedback?status=unknown", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code)

	req = httptest.NewRequest(http.MethodPatch, "/admin/omnichat/response-feedback/"+item.ID.String()+"/status", strings.NewReader(`{"status":"promoted"}`))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusConflict, w.Code)
}
