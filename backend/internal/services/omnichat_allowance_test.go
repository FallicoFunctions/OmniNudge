package services

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
)

type allowancePlanReaderFake struct {
	plan      string
	expiresAt *time.Time
	err       error
}

func (f allowancePlanReaderFake) GetPlan(context.Context, int) (string, *time.Time, error) {
	return f.plan, f.expiresAt, f.err
}

type allowanceBillingFake struct {
	reserved   []uuid.UUID
	captured   []uuid.UUID
	refunded   []uuid.UUID
	err        error
	captureErr error
}

func (f *allowanceBillingFake) ReserveOwned(_ context.Context, _ int, operationID uuid.UUID, usageKind string) (*models.OmniCreditsUsageReservation, error) {
	if f.err != nil {
		return nil, f.err
	}
	f.reserved = append(f.reserved, operationID)
	return &models.OmniCreditsUsageReservation{OperationID: operationID, UsageKind: usageKind, Cost: 1}, nil
}
func (f *allowanceBillingFake) CaptureOwned(_ context.Context, _ int, operationID uuid.UUID) error {
	f.captured = append(f.captured, operationID)
	return f.captureErr
}
func (f *allowanceBillingFake) RefundOwned(_ context.Context, _ int, operationID uuid.UUID) error {
	f.refunded = append(f.refunded, operationID)
	return nil
}

func TestOmniChatAllowanceGuestUsesThirtyReplyRollingWindow(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	now := time.Date(2026, time.July, 22, 15, 0, 0, 0, time.UTC)
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{})
	allowance.now = func() time.Time { return now }

	lease, err := allowance.Reserve(context.Background(), nil, "203.0.113.7", OmniChatGuestReplyLimit)
	if err != nil {
		t.Fatalf("reserve guest allowance: %v", err)
	}
	if !lease.State.Allowed || lease.State.Remaining != 0 || lease.State.Limit != OmniChatGuestReplyLimit {
		t.Fatalf("unexpected full guest lease: %+v", lease.State)
	}

	denied, err := allowance.Reserve(context.Background(), nil, "203.0.113.7", 1)
	if err != nil {
		t.Fatalf("reserve denied guest allowance: %v", err)
	}
	if denied.State.Allowed || denied.State.ResetAt == nil || !denied.State.ResetAt.Equal(now.Add(OmniChatAllowanceWindow)) {
		t.Fatalf("expected denial with exact rolling reset, got %+v", denied.State)
	}

	now = now.Add(OmniChatAllowanceWindow + time.Nanosecond)
	available, err := allowance.Status(context.Background(), nil, "203.0.113.7")
	if err != nil {
		t.Fatalf("inspect expired guest allowance: %v", err)
	}
	if available.Remaining != OmniChatGuestReplyLimit || available.ResetAt != nil {
		t.Fatalf("expected all guest replies to roll back in, got %+v", available)
	}
}

func TestOmniChatAllowanceRepliesReturnIndividuallyAfterTwentyFourHours(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	now := time.Date(2026, time.July, 22, 15, 0, 0, 0, time.UTC)
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{})
	allowance.now = func() time.Time { return now }

	first, err := allowance.Reserve(context.Background(), nil, "203.0.113.8", 1)
	if err != nil || !first.State.Allowed {
		t.Fatalf("reserve first reply: lease=%+v err=%v", first, err)
	}
	now = now.Add(time.Hour)
	second, err := allowance.Reserve(context.Background(), nil, "203.0.113.8", 1)
	if err != nil || !second.State.Allowed {
		t.Fatalf("reserve second reply: lease=%+v err=%v", second, err)
	}

	now = now.Add(23*time.Hour + time.Nanosecond)
	state, err := allowance.Status(context.Background(), nil, "203.0.113.8")
	if err != nil {
		t.Fatalf("inspect partially replenished allowance: %v", err)
	}
	if state.Used != 1 || state.Remaining != OmniChatGuestReplyLimit-1 {
		t.Fatalf("expected only the first reply to return, got %+v", state)
	}
	wantReset := now.Add(time.Hour - time.Nanosecond)
	if state.ResetAt == nil || !state.ResetAt.Equal(wantReset) {
		t.Fatalf("next reply reset = %v, want %v", state.ResetAt, wantReset)
	}
}

func TestOmniChatAllowanceRegisteredFreeUsesTwoHundredFiftyReplies(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{plan: "free"})

	userID := 42
	lease, err := allowance.Reserve(context.Background(), &userID, "", OmniChatFreeReplyLimit)
	if err != nil {
		t.Fatalf("reserve free allowance: %v", err)
	}
	if lease.State.Limit != OmniChatFreeReplyLimit || lease.State.Remaining != 0 || lease.State.Tier != OmniChatAllowanceTierFree {
		t.Fatalf("unexpected registered allowance: %+v", lease.State)
	}
}

func TestOmniChatAllowanceExpiredPaidPlanUsesFreeLimit(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	now := time.Date(2026, time.July, 22, 15, 0, 0, 0, time.UTC)
	expired := now.Add(-time.Minute)
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{plan: "premium", expiresAt: &expired})
	allowance.now = func() time.Time { return now }

	userID := 42
	state, err := allowance.Status(context.Background(), &userID, "")
	if err != nil {
		t.Fatalf("inspect expired plan: %v", err)
	}
	if state.Unlimited || state.Limit != OmniChatFreeReplyLimit || state.Tier != OmniChatAllowanceTierFree {
		t.Fatalf("expired paid plan must be free: %+v", state)
	}
}

func TestOmniChatAllowanceActivePaidPlanIsUnlimited(t *testing.T) {
	expires := time.Now().Add(time.Hour)
	allowance := NewOmniChatAllowance(NoopCache{}, allowancePlanReaderFake{plan: "plus", expiresAt: &expires})
	userID := 42

	lease, err := allowance.Reserve(context.Background(), &userID, "", 3)
	if err != nil {
		t.Fatalf("reserve paid allowance: %v", err)
	}
	if !lease.State.Allowed || !lease.State.Unlimited || lease.State.Tier != OmniChatAllowanceTierPaid {
		t.Fatalf("active paid plan should be unlimited: %+v", lease.State)
	}
}

func TestOmniChatAllowanceReleasesFailedReplies(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{plan: "free"})
	userID := 42

	lease, err := allowance.Reserve(context.Background(), &userID, "", 3)
	if err != nil {
		t.Fatalf("reserve allowance: %v", err)
	}
	if err := allowance.Commit(context.Background(), lease, 1); err != nil {
		t.Fatalf("refund failed replies: %v", err)
	}
	state, err := allowance.Status(context.Background(), &userID, "")
	if err != nil {
		t.Fatalf("inspect allowance: %v", err)
	}
	if state.Used != 1 || state.Remaining != OmniChatFreeReplyLimit-1 {
		t.Fatalf("only successful reply should count: %+v", state)
	}
}

func TestOmniChatAllowanceReserveIsAtomicUnderConcurrency(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{})
	var allowed atomic.Int32
	var wg sync.WaitGroup
	for range 80 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			lease, err := allowance.Reserve(context.Background(), nil, "198.51.100.9", 1)
			if err != nil {
				t.Errorf("reserve concurrently: %v", err)
				return
			}
			if lease.State.Allowed {
				allowed.Add(1)
			}
		}()
	}
	wg.Wait()
	if got := allowed.Load(); got != OmniChatGuestReplyLimit {
		t.Fatalf("allowed %d concurrent replies, want %d", got, OmniChatGuestReplyLimit)
	}
}

func TestOmniChatAllowanceUsesCreditsAfterRegisteredFreeWindowIsExhausted(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	billing := &allowanceBillingFake{}
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{plan: "free"}).SetBilling(billing)
	userID := 42

	lease, err := allowance.Reserve(context.Background(), &userID, "", OmniChatFreeReplyLimit)
	if err != nil || !lease.State.Allowed {
		t.Fatalf("exhaust free allowance: lease=%+v err=%v", lease, err)
	}
	creditLease, err := allowance.Reserve(context.Background(), &userID, "", 2)
	if err != nil {
		t.Fatalf("reserve credit-backed replies: %v", err)
	}
	if !creditLease.State.Allowed || !creditLease.State.PaidWithCredits || creditLease.State.CreditCost != 2 {
		t.Fatalf("expected credit-backed allowance, got %+v", creditLease.State)
	}
	if err := allowance.Commit(context.Background(), creditLease, 1); err != nil {
		t.Fatalf("commit credit-backed replies: %v", err)
	}
	if len(billing.captured) != 1 || len(billing.refunded) != 1 {
		t.Fatalf("captured=%d refunded=%d", len(billing.captured), len(billing.refunded))
	}
}

func TestOmniChatAllowanceCommitSurfacesCaptureOperationContext(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	billing := &allowanceBillingFake{captureErr: errors.New("database unavailable")}
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{plan: "free"}).SetBilling(billing)
	userID := 42

	_, err := allowance.Reserve(context.Background(), &userID, "", OmniChatFreeReplyLimit)
	if err != nil {
		t.Fatalf("exhaust free allowance: %v", err)
	}
	lease, err := allowance.Reserve(context.Background(), &userID, "", 1)
	if err != nil {
		t.Fatalf("reserve credit overage: %v", err)
	}
	err = allowance.Commit(context.Background(), lease, 1)
	if err == nil {
		t.Fatal("expected capture failure")
	}
	if !strings.Contains(err.Error(), "user_id=42") ||
		!strings.Contains(err.Error(), "operation_id="+lease.creditOps[0].String()) {
		t.Fatalf("missing billing operation context: %v", err)
	}
}

func TestOmniChatAllowanceSignalsCreditsRequiredWhenBalanceIsInsufficient(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	billing := &allowanceBillingFake{err: models.ErrOmniCreditsInsufficient}
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{plan: "free"}).SetBilling(billing)
	userID := 42
	_, err := allowance.Reserve(context.Background(), &userID, "", OmniChatFreeReplyLimit)
	if err != nil {
		t.Fatalf("exhaust free allowance: %v", err)
	}

	lease, err := allowance.Reserve(context.Background(), &userID, "", 1)
	if err != nil {
		t.Fatalf("insufficient credits should be a product denial, not infrastructure failure: %v", err)
	}
	if lease.State.Allowed || !lease.State.CreditsRequired {
		t.Fatalf("expected credits-required denial, got %+v", lease.State)
	}
}

func TestOmniChatAllowanceDoesNotOfferGuestCreditFallback(t *testing.T) {
	cache := NewMemoryCache()
	defer cache.Stop()
	billing := &allowanceBillingFake{err: errors.New("must not be called")}
	allowance := NewOmniChatAllowance(cache, allowancePlanReaderFake{}).SetBilling(billing)
	_, err := allowance.Reserve(context.Background(), nil, "203.0.113.19", OmniChatGuestReplyLimit)
	if err != nil {
		t.Fatalf("exhaust guest allowance: %v", err)
	}
	lease, err := allowance.Reserve(context.Background(), nil, "203.0.113.19", 1)
	if err != nil {
		t.Fatalf("reserve denied guest allowance: %v", err)
	}
	if lease.State.Allowed || lease.State.CreditsRequired || len(billing.reserved) != 0 {
		t.Fatalf("guest credit fallback must remain disabled: %+v", lease.State)
	}
}
