package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// Verifier is satisfied by CryptoVerificationService and test stubs.
type Verifier interface {
	Verify(ctx context.Context, txid, coin string) (*services.VerificationResult, error)
}

// PriceOracle is satisfied by PriceOracleService and test stubs.
type PriceOracle interface {
	GetUSDPrice(ctx context.Context, coin string) (float64, error)
}

// PaymentsHandler handles crypto payment submission and status queries.
type PaymentsHandler struct {
	payRepo     *models.CryptoPaymentRepository
	planSvc     *services.PlanService
	verifier    Verifier
	priceOracle PriceOracle
}

// NewPaymentsHandler creates a PaymentsHandler. In production, pass the real
// CryptoVerificationService and PriceOracleService.
func NewPaymentsHandler(
	payRepo *models.CryptoPaymentRepository,
	planSvc *services.PlanService,
	verifier Verifier,
	priceOracle PriceOracle,
) *PaymentsHandler {
	return &PaymentsHandler{
		payRepo:     payRepo,
		planSvc:     planSvc,
		verifier:    verifier,
		priceOracle: priceOracle,
	}
}

type submitRequest struct {
	TXID       string `json:"txid"        binding:"required"`
	Coin       string `json:"coin"        binding:"required"`
	PlanMonths int    `json:"plan_months" binding:"required,min=1"`
}

// SubmitCryptoPayment handles POST /api/v1/payments/crypto/submit
//
// Flow:
//  1. Validate input
//  2. Reject known TXIDs (replay protection)
//  3. Fetch USD price for the coin
//  4. Verify the transaction on-chain
//  5. Check amount >= plan price * slippage tolerance
//  6. If confirmed → upgrade immediately; if pending → store for worker
//
// @Summary  Submit a crypto payment for plan upgrade
// @Tags     payments
// @Accept   json
// @Produce  json
// @Param    body body submitRequest true "Payment details"
// @Success  200 {object} map[string]any "Confirmed — plan upgraded"
// @Success  202 {object} map[string]any "Pending confirmations"
// @Failure  400 {object} map[string]any "Bad request"
// @Failure  402 {object} map[string]any "Amount insufficient"
// @Failure  409 {object} map[string]any "TXID already submitted"
// @Router   /payments/crypto/submit [post]
func (h *PaymentsHandler) SubmitCryptoPayment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req submitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Coin = strings.ToUpper(req.Coin)
	validCoins := map[string]bool{models.CoinBTC: true, models.CoinETH: true, models.CoinCAH: true}
	if !validCoins[req.Coin] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unsupported coin: %s", req.Coin)})
		return
	}

	// Replay protection: reject TXIDs we've already seen
	existing, _ := h.payRepo.GetByTXID(c.Request.Context(), req.TXID, req.Coin)
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "transaction already submitted", "status": existing.Status})
		return
	}

	// Get live USD price for slippage-aware amount validation
	usdPrice, err := h.priceOracle.GetUSDPrice(c.Request.Context(), req.Coin)
	if err != nil {
		log.Printf("[payments] price oracle error for %s: %v", req.Coin, err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "could not fetch current price, please try again"})
		return
	}

	// Verify the transaction on-chain
	result, err := h.verifier.Verify(c.Request.Context(), req.TXID, req.Coin)
	if err != nil {
		log.Printf("[payments] verification failed for txid=%s coin=%s: %v", req.TXID, req.Coin, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "transaction could not be verified: " + err.Error()})
		return
	}

	usdValue := result.AmountReceived * usdPrice
	planPrice, err := h.planSvc.PriceForCoin(req.Coin)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	requiredUSD := planPrice * float64(req.PlanMonths) * services.PaymentSlippageTolerance

	if usdValue < requiredUSD {
		// Store the record so we know this TXID was attempted (prevents gaming)
		_, _ = h.payRepo.Create(c.Request.Context(), &models.CryptoPayment{
			UserID: userID, TXID: req.TXID, Coin: req.Coin,
			USDPriceAtSubmit: usdPrice, AmountReceived: result.AmountReceived,
			USDValue: usdValue, PlanMonths: req.PlanMonths,
		})
		_, _ = h.payRepo.GetByTXID(c.Request.Context(), req.TXID, req.Coin) // fetch ID
		// Mark it insufficient immediately (best effort)
		if p, err := h.payRepo.GetByTXID(c.Request.Context(), req.TXID, req.Coin); err == nil {
			_ = h.payRepo.UpdateStatus(c.Request.Context(), p.ID, models.StatusInsufficient, result.Confirmations, nil)
		}
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error":        "payment amount insufficient",
			"usd_received": fmt.Sprintf("%.4f", usdValue),
			"usd_required": fmt.Sprintf("%.4f", planPrice*float64(req.PlanMonths)),
		})
		return
	}

	payment := &models.CryptoPayment{
		UserID:           userID,
		TXID:             req.TXID,
		Coin:             req.Coin,
		USDPriceAtSubmit: usdPrice,
		AmountReceived:   result.AmountReceived,
		USDValue:         usdValue,
		PlanMonths:       req.PlanMonths,
	}
	id, err := h.payRepo.Create(c.Request.Context(), payment)
	if err != nil {
		// Unique constraint hit — concurrent duplicate submit
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": "transaction already submitted"})
			return
		}
		log.Printf("[payments] store payment error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record payment"})
		return
	}

	if result.Confirmed {
		now := c.Request.Context().Value("now") // nil in production — that's fine
		_ = now
		if err := h.payRepo.UpdateStatus(c.Request.Context(), id, models.StatusConfirmed, result.Confirmations, nil); err != nil {
			log.Printf("[payments] confirm status update failed: %v", err)
		}
		if err := h.planSvc.Upgrade(c.Request.Context(), userID, req.PlanMonths); err != nil {
			log.Printf("[payments] plan upgrade failed for user %d: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "payment confirmed but plan upgrade failed, contact support"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status":     "confirmed",
			"payment_id": id,
			"message":    "Plan upgraded successfully",
		})
		return
	}

	// Not yet confirmed — worker will pick it up
	c.JSON(http.StatusAccepted, gin.H{
		"status":        "pending",
		"payment_id":    id,
		"confirmations": result.Confirmations,
		"message":       "Transaction found, waiting for confirmations",
	})
}

// GetPaymentStatus handles GET /api/v1/payments/crypto/:txid/status
//
// @Summary  Get status of a submitted crypto payment
// @Tags     payments
// @Produce  json
// @Param    txid  path   string true "Transaction ID"
// @Param    coin  query  string true "Coin ticker (BTC, ETH, CAH)"
// @Success  200   {object} map[string]any
// @Failure  404   {object} map[string]any
// @Router   /payments/crypto/{txid}/status [get]
func (h *PaymentsHandler) GetPaymentStatus(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	txid := c.Param("txid")
	coin := strings.ToUpper(c.Query("coin"))
	if coin == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "coin query param required"})
		return
	}

	payment, err := h.payRepo.GetByTXID(c.Request.Context(), txid, coin)
	if err != nil {
		if errors.Is(err, errNotFound(err)) || strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch payment"})
		return
	}
	if payment.UserID != userID {
		// TXIDs are not a capability.  Hide the record so callers cannot use
		// the endpoint to enumerate another account's payment history.
		c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"payment_id":    payment.ID,
		"status":        payment.Status,
		"confirmations": payment.Confirmations,
		"coin":          payment.Coin,
		"usd_value":     payment.USDValue,
		"plan_months":   payment.PlanMonths,
		"created_at":    payment.CreatedAt,
		"confirmed_at":  payment.ConfirmedAt,
	})
}

// errNotFound is a sentinel to detect not-found errors without importing pgx here.
func errNotFound(err error) error { return err }
