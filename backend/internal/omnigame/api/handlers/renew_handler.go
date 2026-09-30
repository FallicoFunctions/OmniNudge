package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
)

type worldTokenValidator interface {
	ValidateOmniRaveWorldJWTContext(ctx context.Context, token string) (*services.OmniRaveWorldJWTClaims, error)
}

type worldTokenRenewer interface {
	RenewWorldToken(ctx context.Context, current *services.OmniRaveWorldJWTClaims, remoteIP string) (string, error)
}

// RenewHandler extends a live world session: the runtime trades its current,
// still-valid world token for a fresh one before it expires, then hands the
// new token to the world over the open socket.
type RenewHandler struct {
	validator             worldTokenValidator
	renewer               worldTokenRenewer
	guestIdentityResolver *GuestIdentityResolver
}

func NewRenewHandler(validator worldTokenValidator, renewer worldTokenRenewer, resolver *GuestIdentityResolver) *RenewHandler {
	if resolver == nil {
		resolver = NewGuestIdentityResolver(nil)
	}
	return &RenewHandler{validator: validator, renewer: renewer, guestIdentityResolver: resolver}
}

func (h *RenewHandler) Renew(c *gin.Context) {
	var req struct {
		WorldSessionToken string `json:"worldSessionToken"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.WorldSessionToken == "" {
		apiresponse.WriteError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	claims, err := h.validator.ValidateOmniRaveWorldJWTContext(c.Request.Context(), req.WorldSessionToken)
	if err != nil {
		apiresponse.WriteError(c, http.StatusUnauthorized, "World session expired")
		return
	}
	token, err := h.renewer.RenewWorldToken(c.Request.Context(), claims, h.guestIdentityResolver.Resolve(c))
	switch {
	case errors.Is(err, service.ErrSanctionedGuest):
		apiresponse.WriteError(c, http.StatusForbidden, "Guest access is blocked")
		return
	case errors.Is(err, service.ErrRenewalNotSupported):
		apiresponse.WriteError(c, http.StatusBadRequest, "This session cannot be renewed here")
		return
	case err != nil:
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}
	c.JSON(http.StatusOK, gin.H{"worldSessionToken": token})
}
