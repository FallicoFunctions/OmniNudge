package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/omnigame/model"
)

type sessionService interface {
	CreateLaunchSession(ctx context.Context, req model.LaunchRequest, identity model.PlayerIdentity) (*model.LaunchSession, error)
	BuildLaunchURL(session *model.LaunchSession) (string, error)
	ExchangeLaunchSession(ctx context.Context, req model.SessionExchangeRequest) (*model.SessionExchangeResponse, error)
}

type LaunchHandler struct {
	sessionService        sessionService
	guestIdentityResolver *GuestIdentityResolver
}

func NewLaunchHandler(sessionService sessionService, guestIdentityResolver *GuestIdentityResolver) *LaunchHandler {
	if guestIdentityResolver == nil {
		guestIdentityResolver = NewGuestIdentityResolver(nil)
	}

	return &LaunchHandler{
		sessionService:        sessionService,
		guestIdentityResolver: guestIdentityResolver,
	}
}

func (h *LaunchHandler) CreateOmniRaveLaunch(c *gin.Context) {
	var req model.LaunchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	identity := model.PlayerIdentity{}
	if userID, ok := c.Get("user_id"); ok {
		if typed, ok := userID.(int); ok {
			identity.UserID = &typed
		}
	}
	if username, ok := c.Get("username"); ok {
		if typed, ok := username.(string); ok {
			identity.Username = typed
		}
	}
	if tokenVersion, ok := c.Get("token_version"); ok {
		if typed, ok := tokenVersion.(int); ok {
			identity.TokenVersion = typed
		}
	}

	session, err := h.sessionService.CreateLaunchSession(c.Request.Context(), req, identity)
	if err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, err.Error())
		return
	}

	launchURL, err := h.sessionService.BuildLaunchURL(session)
	if err != nil {
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	c.JSON(http.StatusOK, model.LaunchResponse{LaunchURL: launchURL})
}

func (h *LaunchHandler) ExchangeSession(c *gin.Context) {
	var req model.SessionExchangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	req.RemoteIP = h.guestIdentityResolver.Resolve(c)

	session, err := h.sessionService.ExchangeLaunchSession(c.Request.Context(), req)
	if err != nil {
		apiresponse.WriteError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.JSON(http.StatusOK, session)
}
