package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	omnigameservice "github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	servicemocks "github.com/omninudge/backend/internal/services/mocks"
	"github.com/stretchr/testify/require"
)

type fakeRuntimeAuthService struct {
	loginResponse  *model.RuntimeAuthResponse
	signupResponse *model.RuntimeAuthResponse
	logoutResponse *model.RuntimeAuthResponse
	err            error
	lastInput      model.RuntimeAuthRequest
}

func (f *fakeRuntimeAuthService) Login(_ context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	f.lastInput = input
	return f.loginResponse, f.err
}

func (f *fakeRuntimeAuthService) Signup(_ context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	f.lastInput = input
	return f.signupResponse, f.err
}

func (f *fakeRuntimeAuthService) Logout(_ context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	f.lastInput = input
	return f.logoutResponse, f.err
}

func TestRuntimeAuthHandler_LogoutReturnsFreshGuestRuntimeState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	handler := NewRuntimeAuthHandler(&fakeRuntimeAuthService{
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

func TestRuntimeAuthHandler_SignupBindsConsentAndCaptchaFields(t *testing.T) {
	gin.SetMode(gin.TestMode)

	fakeService := &fakeRuntimeAuthService{
		signupResponse: &model.SessionExchangeResponse{
			PlayerID:   "user-42",
			PlayerName: "nick",
			Mode:       model.LaunchModeAccount,
			ActiveZone: "underground",
			LastVenue:  "underground",
			Settings:   model.DefaultOmniRaveSettings(),
		},
	}
	router := gin.New()
	handler := NewRuntimeAuthHandler(fakeService)
	router.POST("/api/v1/omnigame/runtime/auth/signup", handler.Signup)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/runtime/auth/signup", strings.NewReader(`{"username":"nick","email":"nick@example.com","password":"correct-horse-battery-staple","turnstileToken":"cf-token-1","acceptPrivacyPolicy":true,"acceptTerms":true,"currentVenue":"underground"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "cf-token-1", fakeService.lastInput.TurnstileToken)
	require.True(t, fakeService.lastInput.AcceptPrivacyPolicy)
	require.True(t, fakeService.lastInput.AcceptTerms)
}

func TestRuntimeAuthAdapter_SignupForwardsConsentFieldsToAuthService(t *testing.T) {
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	userRepo := servicemocks.NewUserRepository()
	authService.SetUserRepository(userRepo)

	sessionService := omnigameservice.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)
	adapter := NewRuntimeAuthService(sessionService, authService)

	_, err := adapter.Signup(context.Background(), model.RuntimeAuthRequest{
		Username:            "nick",
		Password:            "correct-horse-battery-staple",
		Email:               "nick@example.com",
		TurnstileToken:      "cf-token-1",
		AcceptPrivacyPolicy: false,
		AcceptTerms:         false,
		CurrentVenue:        "underground",
	})

	require.ErrorContains(t, err, "Privacy Policy")
}
