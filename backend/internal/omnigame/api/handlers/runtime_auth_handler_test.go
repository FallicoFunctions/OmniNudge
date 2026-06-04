package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/stretchr/testify/require"
)

type fakeRuntimeAuthService struct {
	loginResponse  *model.RuntimeAuthResponse
	signupResponse *model.RuntimeAuthResponse
	logoutResponse *model.RuntimeAuthResponse
	err            error
}

func (f fakeRuntimeAuthService) Login(_ context.Context, _ model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	return f.loginResponse, f.err
}

func (f fakeRuntimeAuthService) Signup(_ context.Context, _ model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	return f.signupResponse, f.err
}

func (f fakeRuntimeAuthService) Logout(_ context.Context, _ model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	return f.logoutResponse, f.err
}

func TestRuntimeAuthHandler_LogoutReturnsFreshGuestRuntimeState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	handler := NewRuntimeAuthHandler(fakeRuntimeAuthService{
		logoutResponse: &model.SessionExchangeResponse{
			PlayerID:   "guest-new",
			PlayerName: "Guest-9021",
			Mode:       model.LaunchModeGuest,
			ActiveZone: "main_stage",
			LastVenue:  "main_stage",
			Settings:   model.DefaultOmniRaveSettings(),
		},
	})
	router.POST("/api/v1/omnigame/runtime/auth/logout", handler.Logout)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/runtime/auth/logout", strings.NewReader(`{"currentVenue":"main_stage"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"mode":"guest"`)
	require.Contains(t, rec.Body.String(), `"playerName":"Guest-9021"`)
}
