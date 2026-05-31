package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubVerifier is a test double for crypto verification that returns
// canned results without hitting the network.
type stubVerifier struct {
	result *services.VerificationResult
	err    error
}

func (s *stubVerifier) Verify(_ context.Context, _, _ string) (*services.VerificationResult, error) {
	return s.result, s.err
}

// stubPriceOracle returns a fixed USD price for any coin.
type stubPriceOracle struct {
	price float64
	err   error
}

func (s *stubPriceOracle) GetUSDPrice(_ context.Context, _ string) (float64, error) {
	return s.price, s.err
}

func setupPaymentsTest(t *testing.T) (*PaymentsHandler, *models.UserRepository, *models.CryptoPaymentRepository, int) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	payRepo := models.NewCryptoPaymentRepository(db.Pool)
	planSvc := services.NewPlanService(userRepo)

	user := &models.User{Username: "payments_test_user", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user))

	handler := NewPaymentsHandler(payRepo, planSvc, nil, nil)
	return handler, userRepo, payRepo, user.ID
}

func makePaymentsRouter(h *PaymentsHandler, userID int) *gin.Engine {
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	})
	r.POST("/api/v1/payments/crypto/submit", h.SubmitCryptoPayment)
	r.GET("/api/v1/payments/crypto/:txid/status", h.GetPaymentStatus)
	return r
}

func TestPaymentsHandler_SubmitCryptoPayment_ImmediateConfirmation(t *testing.T) {
	handler, userRepo, _, userID := setupPaymentsTest(t)
	ctx := context.Background()

	// Stub: tx is confirmed, amount sufficient
	handler.verifier = &stubVerifier{result: &services.VerificationResult{
		AmountReceived: 0.000067,
		Confirmations:  services.BTCConfirmationThreshold,
		Confirmed:      true,
	}}
	handler.priceOracle = &stubPriceOracle{price: 45000.00}

	body, _ := json.Marshal(map[string]any{
		"txid":        "btctx001",
		"coin":        "BTC",
		"plan_months": 1,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/crypto/submit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	makePaymentsRouter(handler, userID).ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "confirmed", resp["status"])

	// User plan should be upgraded
	plan, expiresAt, err := userRepo.GetPlan(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, models.PlanPaid, plan)
	assert.NotNil(t, expiresAt)
}

func TestPaymentsHandler_SubmitCryptoPayment_PendingConfirmations(t *testing.T) {
	handler, userRepo, _, userID := setupPaymentsTest(t)
	ctx := context.Background()

	// Stub: tx found but not yet confirmed
	handler.verifier = &stubVerifier{result: &services.VerificationResult{
		AmountReceived: 0.000067,
		Confirmations:  1,
		Confirmed:      false,
	}}
	handler.priceOracle = &stubPriceOracle{price: 45000.00}

	body, _ := json.Marshal(map[string]any{"txid": "btctx002", "coin": "BTC", "plan_months": 1})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/crypto/submit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	makePaymentsRouter(handler, userID).ServeHTTP(w, req)

	assert.Equal(t, http.StatusAccepted, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "pending", resp["status"])

	// Plan should NOT be upgraded yet
	plan, _, err := userRepo.GetPlan(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, models.PlanFree, plan)
}

func TestPaymentsHandler_SubmitCryptoPayment_InsufficientAmount(t *testing.T) {
	handler, _, _, userID := setupPaymentsTest(t)

	// Price $45000, amount 0.00001 BTC = $0.45 — below $2.99
	handler.verifier = &stubVerifier{result: &services.VerificationResult{
		AmountReceived: 0.00001,
		Confirmations:  3,
		Confirmed:      true,
	}}
	handler.priceOracle = &stubPriceOracle{price: 45000.00}

	body, _ := json.Marshal(map[string]any{"txid": "btctx003", "coin": "BTC", "plan_months": 1})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/crypto/submit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	makePaymentsRouter(handler, userID).ServeHTTP(w, req)

	assert.Equal(t, http.StatusPaymentRequired, w.Code)
}

func TestPaymentsHandler_SubmitCryptoPayment_DuplicateTXID(t *testing.T) {
	handler, _, _, userID := setupPaymentsTest(t)

	handler.verifier = &stubVerifier{result: &services.VerificationResult{
		AmountReceived: 0.000067, Confirmations: 3, Confirmed: true,
	}}
	handler.priceOracle = &stubPriceOracle{price: 45000.00}

	body, _ := json.Marshal(map[string]any{"txid": "btctx_dup", "coin": "BTC", "plan_months": 1})
	router := makePaymentsRouter(handler, userID)

	// First submission
	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/crypto/submit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Duplicate submission
	body, _ = json.Marshal(map[string]any{"txid": "btctx_dup", "coin": "BTC", "plan_months": 1})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/payments/crypto/submit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusConflict, w.Code)
}

func TestPaymentsHandler_GetPaymentStatus(t *testing.T) {
	handler, _, payRepo, userID := setupPaymentsTest(t)
	ctx := context.Background()

	// Seed a payment
	_, err := payRepo.Create(ctx, &models.CryptoPayment{
		UserID: userID, TXID: "statuscheck001", Coin: models.CoinETH,
		USDPriceAtSubmit: 2500, AmountReceived: 0.001196, USDValue: 2.99, PlanMonths: 1,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/payments/crypto/statuscheck001/status?coin=ETH", nil)
	w := httptest.NewRecorder()
	makePaymentsRouter(handler, userID).ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "pending", resp["status"])
}

func TestPaymentsHandler_InvalidInput(t *testing.T) {
	handler, _, _, userID := setupPaymentsTest(t)
	router := makePaymentsRouter(handler, userID)

	tests := []struct {
		name string
		body map[string]any
	}{
		{"missing txid", map[string]any{"coin": "BTC", "plan_months": 1}},
		{"missing coin", map[string]any{"txid": "abc", "plan_months": 1}},
		{"invalid coin", map[string]any{"txid": "abc", "coin": "DOGE", "plan_months": 1}},
		{"zero months", map[string]any{"txid": "abc", "coin": "BTC", "plan_months": 0}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(tc.body)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/crypto/submit", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}
