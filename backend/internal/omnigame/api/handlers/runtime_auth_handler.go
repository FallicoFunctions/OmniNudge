package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
)

type runtimeAuthService interface {
	Login(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error)
	Signup(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error)
	Logout(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error)
}

type RuntimeAuthHandler struct {
	runtimeAuth runtimeAuthService
}

type runtimeAuthFailure struct {
	statusCode    int
	clientMessage string
	err           error
}

func (e *runtimeAuthFailure) Error() string {
	if e.err != nil {
		return e.err.Error()
	}
	return e.clientMessage
}

func (e *runtimeAuthFailure) Unwrap() error {
	return e.err
}

func NewRuntimeAuthHandler(runtimeAuth runtimeAuthService) *RuntimeAuthHandler {
	return &RuntimeAuthHandler{runtimeAuth: runtimeAuth}
}

func NewRuntimeAuthService(sessionService *service.SessionService, authService *services.AuthService) runtimeAuthService {
	return runtimeAuthAdapter{
		sessionService: sessionService,
		authService:    authService,
	}
}

func (h *RuntimeAuthHandler) Login(c *gin.Context) {
	var input model.RuntimeAuthRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.RespondBadRequest(c, "invalid runtime auth request", err)
		return
	}

	response, err := h.runtimeAuth.Login(c.Request.Context(), input)
	if err != nil {
		respondRuntimeAuthError(c, err)
		return
	}

	utils.RespondSuccess(c, response)
}

func (h *RuntimeAuthHandler) Signup(c *gin.Context) {
	var input model.RuntimeAuthRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.RespondBadRequest(c, "invalid runtime auth request", err)
		return
	}

	response, err := h.runtimeAuth.Signup(c.Request.Context(), input)
	if err != nil {
		respondRuntimeAuthError(c, err)
		return
	}

	utils.RespondSuccess(c, response)
}

func (h *RuntimeAuthHandler) Logout(c *gin.Context) {
	var input model.RuntimeAuthRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		utils.RespondBadRequest(c, "invalid runtime auth request", err)
		return
	}

	response, err := h.runtimeAuth.Logout(c.Request.Context(), input)
	if err != nil {
		utils.RespondInternalError(c, "unable to build omnirave runtime session", err)
		return
	}

	utils.RespondSuccess(c, response)
}

func respondRuntimeAuthError(c *gin.Context, err error) {
	var runtimeErr *runtimeAuthFailure
	if errors.As(err, &runtimeErr) {
		switch runtimeErr.statusCode {
		case http.StatusUnauthorized:
			utils.RespondUnauthorized(c, runtimeErr.clientMessage)
		case http.StatusBadRequest:
			utils.RespondBadRequest(c, runtimeErr.clientMessage, err)
		default:
			utils.RespondInternalError(c, runtimeErr.clientMessage, err)
		}
		return
	}

	utils.RespondInternalError(c, "unable to build omnirave runtime session", err)
}

type runtimeAuthAdapter struct {
	sessionService *service.SessionService
	authService    *services.AuthService
}

func (a runtimeAuthAdapter) Login(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	userRepo := a.authService.UserRepository()
	if userRepo == nil {
		return nil, newRuntimeBootstrapFailure(fmt.Errorf("runtime auth user repository not configured"))
	}

	user, _, err := a.authService.Login(ctx, userRepo, &services.LoginRequest{
		Username: input.Username,
		Password: input.Password,
	})
	if err != nil {
		return nil, newRuntimeAuthFailure(http.StatusUnauthorized, "invalid username or password", err)
	}

	response, err := a.sessionService.BuildRuntimeAccountSession(ctx, input, runtimeIdentityFromUser(user))
	if err != nil {
		return nil, newRuntimeBootstrapFailure(err)
	}
	return response, nil
}

func (a runtimeAuthAdapter) Signup(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	userRepo := a.authService.UserRepository()
	if userRepo == nil {
		return nil, newRuntimeBootstrapFailure(fmt.Errorf("runtime auth user repository not configured"))
	}

	var email *string
	if trimmedEmail := strings.TrimSpace(input.Email); trimmedEmail != "" {
		email = &trimmedEmail
	}

	user, _, err := a.authService.Register(ctx, userRepo, &services.RegisterRequest{
		Username:            input.Username,
		Password:            input.Password,
		Email:               email,
		TurnstileToken:      input.TurnstileToken,
		AcceptPrivacyPolicy: input.AcceptPrivacyPolicy,
		AcceptTerms:         input.AcceptTerms,
	})
	if err != nil {
		return nil, classifyRuntimeSignupFailure(err)
	}

	response, err := a.sessionService.BuildRuntimeAccountSession(ctx, input, runtimeIdentityFromUser(user))
	if err != nil {
		return nil, newRuntimeBootstrapFailure(err)
	}
	return response, nil
}

func (a runtimeAuthAdapter) Logout(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	return a.sessionService.BuildRuntimeGuestLogout(ctx, input.CurrentVenue)
}

func runtimeIdentityFromUser(user *models.User) model.PlayerIdentity {
	return model.PlayerIdentity{
		UserID:       &user.ID,
		Username:     user.Username,
		TokenVersion: user.TokenVersion,
	}
}

func newRuntimeAuthFailure(statusCode int, clientMessage string, err error) *runtimeAuthFailure {
	return &runtimeAuthFailure{
		statusCode:    statusCode,
		clientMessage: clientMessage,
		err:           err,
	}
}

func newRuntimeBootstrapFailure(err error) *runtimeAuthFailure {
	return newRuntimeAuthFailure(http.StatusInternalServerError, "unable to build omnirave runtime session", err)
}

func classifyRuntimeSignupFailure(err error) error {
	message := err.Error()
	if isRuntimeSignupValidationError(message) {
		return newRuntimeAuthFailure(http.StatusBadRequest, message, err)
	}
	return newRuntimeBootstrapFailure(err)
}

func isRuntimeSignupValidationError(message string) bool {
	switch {
	case strings.Contains(message, "username must be between"):
		return true
	case strings.Contains(message, "password must be at least"):
		return true
	case strings.Contains(message, "invalid email format"):
		return true
	case strings.Contains(message, "you must accept the Privacy Policy"):
		return true
	case strings.Contains(message, "you must accept the Terms of Service"):
		return true
	case strings.Contains(message, "captcha verification failed"):
		return true
	case strings.Contains(message, "username already taken"):
		return true
	default:
		return false
	}
}
