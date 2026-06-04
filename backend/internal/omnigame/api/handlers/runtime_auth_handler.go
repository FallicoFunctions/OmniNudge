package handlers

import (
	"context"
	"fmt"
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
		utils.RespondUnauthorized(c, "invalid username or password")
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
		utils.RespondBadRequest(c, err.Error(), err)
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

type runtimeAuthAdapter struct {
	sessionService *service.SessionService
	authService    *services.AuthService
}

func (a runtimeAuthAdapter) Login(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	userRepo := a.authService.UserRepository()
	if userRepo == nil {
		return nil, fmt.Errorf("runtime auth user repository not configured")
	}

	user, _, err := a.authService.Login(ctx, userRepo, &services.LoginRequest{
		Username: input.Username,
		Password: input.Password,
	})
	if err != nil {
		return nil, err
	}

	return a.sessionService.BuildRuntimeAccountSession(ctx, input, runtimeIdentityFromUser(user))
}

func (a runtimeAuthAdapter) Signup(ctx context.Context, input model.RuntimeAuthRequest) (*model.RuntimeAuthResponse, error) {
	userRepo := a.authService.UserRepository()
	if userRepo == nil {
		return nil, fmt.Errorf("runtime auth user repository not configured")
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
		return nil, err
	}

	return a.sessionService.BuildRuntimeAccountSession(ctx, input, runtimeIdentityFromUser(user))
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
