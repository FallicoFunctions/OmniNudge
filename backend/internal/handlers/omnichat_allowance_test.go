package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type handlerAllowancePlanFake struct{ plan string }

func (f handlerAllowancePlanFake) GetPlan(context.Context, int) (string, *time.Time, error) {
	return f.plan, nil, nil
}

type insufficientAllowanceBillingFake struct{}

func (insufficientAllowanceBillingFake) ReserveOwned(context.Context, int, uuid.UUID, string) (*models.OmniCreditsUsageReservation, error) {
	return nil, models.ErrOmniCreditsInsufficient
}
func (insufficientAllowanceBillingFake) CaptureOwned(context.Context, int, uuid.UUID) error {
	return nil
}
func (insufficientAllowanceBillingFake) RefundOwned(context.Context, int, uuid.UUID) error {
	return nil
}

func TestOmniChatAllowanceEndpointAndDenialPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache := services.NewMemoryCache()
	defer cache.Stop()
	allowance := services.NewOmniChatAllowance(cache, handlerAllowancePlanFake{})
	handler := NewOmniChatHandler(nil, nil, nil, nil, nil, allowance)

	const guestIP = "203.0.113.7"
	lease, err := allowance.Reserve(context.Background(), nil, guestIP, services.OmniChatGuestReplyLimit)
	if err != nil || !lease.State.Allowed {
		t.Fatalf("fill guest allowance: lease=%+v err=%v", lease, err)
	}

	router := gin.New()
	router.GET("/allowance", handler.GetAllowance)
	router.POST("/preview", handler.PreviewSendMessage)

	statusRequest := httptest.NewRequest(http.MethodGet, "/allowance", nil)
	statusRequest.RemoteAddr = guestIP + ":1234"
	statusResponse := httptest.NewRecorder()
	router.ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusOK {
		t.Fatalf("status code = %d, body=%s", statusResponse.Code, statusResponse.Body.String())
	}
	var state services.OmniChatAllowanceState
	if err := json.Unmarshal(statusResponse.Body.Bytes(), &state); err != nil {
		t.Fatalf("decode allowance: %v", err)
	}
	if state.Remaining != 0 || state.Allowed || state.ResetAt == nil {
		t.Fatalf("unexpected exhausted allowance: %+v", state)
	}

	previewRequest := httptest.NewRequest(http.MethodPost, "/preview", bytes.NewBufferString(`{"persona_id":1,"content":"Hello","history":[]}`))
	previewRequest.Header.Set("Content-Type", "application/json")
	previewRequest.RemoteAddr = guestIP + ":1234"
	previewResponse := httptest.NewRecorder()
	router.ServeHTTP(previewResponse, previewRequest)
	if previewResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("preview code = %d, body=%s", previewResponse.Code, previewResponse.Body.String())
	}
	var payload struct {
		Code      string                          `json:"code"`
		Allowance services.OmniChatAllowanceState `json:"allowance"`
	}
	if err := json.Unmarshal(previewResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode denial: %v", err)
	}
	if payload.Code != "rate_limited" || payload.Allowance.Remaining != 0 {
		t.Fatalf("unexpected denial payload: %+v", payload)
	}
	if previewResponse.Header().Get("X-OmniChat-Allowance-Remaining") != "0" {
		t.Fatalf("missing allowance response headers: %v", previewResponse.Header())
	}
}

func TestOmniChatCreditBackedResponseDenialUsesStructuredPaymentRequired(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	if !respondOmniChatCreditsRequired(ctx, fmt.Errorf("reserve response: %w", models.ErrOmniCreditsInsufficient)) {
		t.Fatal("expected insufficient credits to be handled")
	}
	if recorder.Code != http.StatusPaymentRequired {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Code != "payment_required" {
		t.Fatalf("code=%q", payload.Code)
	}
}

func TestOmniChatAllowanceEndpointUsesAuthenticatedFreeAccount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache := services.NewMemoryCache()
	defer cache.Stop()
	allowance := services.NewOmniChatAllowance(cache, handlerAllowancePlanFake{plan: "free"})
	handler := NewOmniChatHandler(nil, nil, nil, nil, nil, allowance)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 42); c.Next() })
	router.GET("/allowance", handler.GetAllowance)

	request := httptest.NewRequest(http.MethodGet, "/allowance", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	var state services.OmniChatAllowanceState
	if err := json.Unmarshal(response.Body.Bytes(), &state); err != nil {
		t.Fatalf("decode allowance: %v", err)
	}
	if state.Tier != services.OmniChatAllowanceTierFree || state.Limit != services.OmniChatFreeReplyLimit || state.Remaining != services.OmniChatFreeReplyLimit {
		t.Fatalf("unexpected free allowance: %+v", state)
	}
}

func TestOmniChatAllowanceReturnsPaymentRequiredForRegisteredOverageWithoutCredits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache := services.NewMemoryCache()
	defer cache.Stop()
	allowance := services.NewOmniChatAllowance(
		cache,
		handlerAllowancePlanFake{plan: "free"},
	).SetBilling(insufficientAllowanceBillingFake{})
	userID := 42
	lease, err := allowance.Reserve(context.Background(), &userID, "", services.OmniChatFreeReplyLimit)
	if err != nil || !lease.State.Allowed {
		t.Fatalf("fill registered allowance: lease=%+v err=%v", lease, err)
	}
	handler := NewOmniChatHandler(nil, nil, nil, nil, nil, allowance)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", userID); c.Next() })
	router.POST("/preview", handler.PreviewSendMessage)

	request := httptest.NewRequest(http.MethodPost, "/preview", bytes.NewBufferString(`{"persona_id":1,"content":"Hello","history":[]}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusPaymentRequired {
		t.Fatalf("preview code=%d body=%s", response.Code, response.Body.String())
	}
	var payload struct {
		Code      string                          `json:"code"`
		Allowance services.OmniChatAllowanceState `json:"allowance"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payment denial: %v", err)
	}
	if payload.Code != "payment_required" || !payload.Allowance.CreditsRequired {
		t.Fatalf("unexpected payment denial: %+v", payload)
	}
}
