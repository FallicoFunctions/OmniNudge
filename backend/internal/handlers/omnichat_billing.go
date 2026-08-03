package handlers

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type omniChatBillingReader interface {
	Catalog() []services.OmniChatBillingOffer
	UsageCosts() map[string]int64
	UsageHistoryOwned(context.Context, int, int) ([]models.OmniCreditsUsageEntry, error)
	FindOffer(string) (services.OmniChatBillingOffer, bool)
	WalletOwned(context.Context, int) (*models.OmniCreditsWallet, error)
	CanReserveVideoOwned(context.Context, int) (bool, int64, error)
}

type OmniChatCheckoutProvider interface {
	CreateCheckout(context.Context, int, uuid.UUID, services.OmniChatBillingOffer) (string, error)
}

type OmniChatBillingHandler struct {
	billing  omniChatBillingReader
	checkout OmniChatCheckoutProvider
}

func NewOmniChatBillingHandler(billing omniChatBillingReader, checkout OmniChatCheckoutProvider) *OmniChatBillingHandler {
	return &OmniChatBillingHandler{billing: billing, checkout: checkout}
}

func (h *OmniChatBillingHandler) Catalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"offers": h.billing.Catalog()})
}

func (h *OmniChatBillingHandler) Wallet(c *gin.Context) {
	wallet, err := h.billing.WalletOwned(c.Request.Context(), c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Billing is temporarily unavailable")
		return
	}
	c.JSON(http.StatusOK, gin.H{"wallet": wallet})
}

func (h *OmniChatBillingHandler) Usage(c *gin.Context) {
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			RespondError(c, http.StatusBadRequest, "Invalid limit")
			return
		}
		limit = value
	}
	items, err := h.billing.UsageHistoryOwned(c.Request.Context(), c.GetInt("user_id"), limit)
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Billing is temporarily unavailable")
		return
	}
	c.JSON(http.StatusOK, gin.H{"usage": items, "costs": h.billing.UsageCosts(), "limit": limit})
}

func (h *OmniChatBillingHandler) VideoEntitlement(c *gin.Context) {
	allowed, cost, err := h.billing.CanReserveVideoOwned(c.Request.Context(), c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Billing is temporarily unavailable")
		return
	}
	c.JSON(http.StatusOK, gin.H{"allowed": allowed, "credit_cost": cost, "unit": services.OmniChatBillingUnitPerSession})
}

func (h *OmniChatBillingHandler) CreateCheckout(c *gin.Context) {
	var request struct {
		OfferID       string    `json:"offer_id"`
		IdempotencyID uuid.UUID `json:"idempotency_id"`
	}
	if err := decodeStrictJSON(c, &request); err != nil || request.IdempotencyID == uuid.Nil {
		RespondError(c, http.StatusBadRequest, "Invalid checkout request")
		return
	}
	offer, ok := h.billing.FindOffer(request.OfferID)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Unknown billing offer")
		return
	}
	if h.checkout == nil {
		RespondError(c, http.StatusServiceUnavailable, "Checkout is not configured")
		return
	}
	url, err := h.checkout.CreateCheckout(c.Request.Context(), c.GetInt("user_id"), request.IdempotencyID, offer)
	if err != nil {
		if errors.Is(err, models.ErrOmniCreditsConflict) {
			RespondError(c, http.StatusConflict, "Checkout idempotency conflict")
			return
		}
		RespondError(c, http.StatusServiceUnavailable, "Checkout is temporarily unavailable")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"checkout_url": url})
}
