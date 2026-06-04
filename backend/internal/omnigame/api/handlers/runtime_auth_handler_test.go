package handlers

import (
	"context"
	"errors"
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
	loginErr       error
	signupErr      error
	logoutErr      error
	lastInput      model.RuntimeAuthRequest
}

func (f *fakeRuntimeAuthService) Login(_ context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	f.lastInput = input
	return f.loginResponse, f.loginErr
}

func (f *fakeRuntimeAuthService) Signup(_ context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	f.lastInput = input
	return f.signupResponse, f.signupErr
}

func (f *fakeRuntimeAuthService) Logout(_ context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	f.lastInput = input
	return f.logoutResponse, f.logoutErr
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

func TestRuntimeAuthHandler_LoginReturnsUnauthorizedForInvalidCredentials(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	handler := NewRuntimeAuthHandler(&fakeRuntimeAuthService{
		loginErr: newRuntimeAuthFailure(http.StatusUnauthorized, "invalid username or password", errors.New("invalid username or password")),
	})
	router.POST("/api/v1/omnigame/runtime/auth/login", handler.Login)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/runtime/auth/login", strings.NewReader(`{"username":"nick","password":"wrong-password"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid username or password")
}

func TestRuntimeAuthHandler_LoginReturnsInternalErrorForBootstrapFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	handler := NewRuntimeAuthHandler(&fakeRuntimeAuthService{
		loginErr: newRuntimeBootstrapFailure(errors.New("generate runtime token: boom")),
	})
	router.POST("/api/v1/omnigame/runtime/auth/login", handler.Login)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/runtime/auth/login", strings.NewReader(`{"username":"nick","password":"correct-horse-battery-staple","currentVenue":"underground"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Contains(t, rec.Body.String(), "unable to build omnirave runtime session")
}

func TestRuntimeAuthHandler_SignupReturnsInternalErrorForBootstrapFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	handler := NewRuntimeAuthHandler(&fakeRuntimeAuthService{
		signupErr: newRuntimeBootstrapFailure(errors.New("generate runtime token: boom")),
	})
	router.POST("/api/v1/omnigame/runtime/auth/signup", handler.Signup)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/runtime/auth/signup", strings.NewReader(`{"username":"nick","password":"correct-horse-battery-staple","turnstileToken":"cf-token-1","acceptPrivacyPolicy":true,"acceptTerms":true,"currentVenue":"underground"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Contains(t, rec.Body.String(), "unable to build omnirave runtime session")
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

	var runtimeErr *runtimeAuthFailure
	require.ErrorAs(t, err, &runtimeErr)
	require.Equal(t, http.StatusBadRequest, runtimeErr.statusCode)
	require.Equal(t, "you must accept the Privacy Policy to create an account", runtimeErr.clientMessage)
}

func TestRuntimeAuthAdapter_SignupClassifiesBootstrapFailureAfterRegistration(t *testing.T) {
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	userRepo := servicemocks.NewUserRepository()
	authService.SetUserRepository(userRepo)

	sessionService := omnigameservice.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		stubRuntimeAuthTokenIssuer{err: errors.New("sign session token: boom")},
	)
	adapter := NewRuntimeAuthService(sessionService, authService)

	_, err := adapter.Signup(context.Background(), model.RuntimeAuthRequest{
		Username:            "nick",
		Password:            "correct-horse-battery-staple",
		Email:               "nick@example.com",
		TurnstileToken:      "cf-token-1",
		AcceptPrivacyPolicy: true,
		AcceptTerms:         true,
		CurrentVenue:        "underground",
	})

	var runtimeErr *runtimeAuthFailure
	require.ErrorAs(t, err, &runtimeErr)
	require.Equal(t, http.StatusInternalServerError, runtimeErr.statusCode)
	require.Equal(t, "unable to build omnirave runtime session", runtimeErr.clientMessage)
}

type stubRuntimeAuthTokenIssuer struct {
	err error
}

func (s stubRuntimeAuthTokenIssuer) GenerateGameSessionJWTWithVersion(_ int, _ string, _ int) (string, error) {
	return "", s.err
}

func (s stubRuntimeAuthTokenIssuer) GenerateOmniRaveWorldJWT(_ services.OmniRaveWorldTokenInput) (string, error) {
	return "", s.err
}
