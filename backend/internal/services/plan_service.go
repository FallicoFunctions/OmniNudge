package services

import (
	"context"
	"fmt"
	"log"
	"time"
)

// planPrices is the authoritative USD price per month per coin.
// CAH is cheaper to incentivise use of the native token.
var planPrices = map[string]float64{
	"BTC": 2.99,
	"ETH": 2.99,
	"CAH": 1.99,
}

// PaymentSlippageTolerance is how far below the listed price we still accept.
// 3% covers minor fee deductions and price movement during broadcast.
const PaymentSlippageTolerance = 0.97

// UserPlanRepository is the subset of user repository methods needed by PlanService.
type UserPlanRepository interface {
	UpdatePlan(ctx context.Context, userID int, plan string, expiresAt *time.Time) error
	GetPlan(ctx context.Context, userID int) (string, *time.Time, error)
	ListUsersWithExpiredPlans(ctx context.Context) ([]int, error)
}

// PlanService manages user subscription state. It is the single authority
// for upgrading and downgrading plans; no other code should write to the
// plan/plan_expires_at columns directly.
type PlanService struct {
	userRepo UserPlanRepository
}

// NewPlanService creates a PlanService.
func NewPlanService(userRepo UserPlanRepository) *PlanService {
	return &PlanService{userRepo: userRepo}
}

// PriceForCoin returns the USD price per month for the given coin.
func (s *PlanService) PriceForCoin(coin string) (float64, error) {
	price, ok := planPrices[coin]
	if !ok {
		return 0, fmt.Errorf("no price defined for coin: %s", coin)
	}
	return price, nil
}

// Upgrade grants the user `months` months of the paid plan. If the user
// already has an active plan, the new months are added to the existing expiry
// so renewals before the deadline don't waste overlap time.
func (s *PlanService) Upgrade(ctx context.Context, userID, months int) error {
	_, currentExpiry, err := s.userRepo.GetPlan(ctx, userID)
	if err != nil {
		return fmt.Errorf("get current plan before upgrade: %w", err)
	}

	var newExpiry time.Time
	duration := time.Duration(months) * 30 * 24 * time.Hour

	if currentExpiry != nil && currentExpiry.After(time.Now()) {
		// Extend from current expiry, not from now
		newExpiry = currentExpiry.Add(duration)
	} else {
		newExpiry = time.Now().Add(duration)
	}

	if err := s.userRepo.UpdatePlan(ctx, userID, "paid", &newExpiry); err != nil {
		return fmt.Errorf("upgrade user %d to paid: %w", userID, err)
	}
	return nil
}

// Downgrade moves the user back to the free plan and clears their expiry.
// Called by the expiry worker; also available for admin use.
func (s *PlanService) Downgrade(ctx context.Context, userID int) error {
	if err := s.userRepo.UpdatePlan(ctx, userID, "free", nil); err != nil {
		return fmt.Errorf("downgrade user %d to free: %w", userID, err)
	}
	return nil
}

// IsPaid returns true if the user currently has an active paid plan.
// On any error it conservatively returns false and logs.
func (s *PlanService) IsPaid(ctx context.Context, userID int) bool {
	plan, expiresAt, err := s.userRepo.GetPlan(ctx, userID)
	if err != nil {
		log.Printf("[plan] IsPaid check failed for user %d: %v", userID, err)
		return false
	}
	if plan != "paid" {
		return false
	}
	// Nil expiry on a paid plan shouldn't happen but treat as active
	if expiresAt == nil {
		return true
	}
	return expiresAt.After(time.Now())
}

// DowngradeExpired finds all users with elapsed plan expiries and moves
// them to the free tier. Called periodically by the plan expiry worker.
func (s *PlanService) DowngradeExpired(ctx context.Context) error {
	ids, err := s.userRepo.ListUsersWithExpiredPlans(ctx)
	if err != nil {
		return fmt.Errorf("list expired plans: %w", err)
	}
	for _, id := range ids {
		if err := s.Downgrade(ctx, id); err != nil {
			log.Printf("[plan] failed to downgrade expired user %d: %v", id, err)
		} else {
			log.Printf("[plan] downgraded expired plan for user %d", id)
		}
	}
	return nil
}
