package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/omninudge/backend/internal/models"
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
	ExtendPlan(ctx context.Context, userID int, plan string, months int) error
	GetPlan(ctx context.Context, userID int) (string, *time.Time, error)
	ListUsersWithExpiredPlans(ctx context.Context) ([]int, error)
	DowngradeExpiredPlans(ctx context.Context) ([]int, error)
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

// Upgrade grants the user `months` months of the Plus plan. If the user
// already has an active plan, the new months are added to the existing expiry
// so renewals before the deadline don't waste overlap time.
func (s *PlanService) Upgrade(ctx context.Context, userID, months int) error {
	return s.UpgradeToPlan(ctx, userID, models.PlanPlus, months)
}

func (s *PlanService) UpgradeToPlan(ctx context.Context, userID int, plan string, months int) error {
	if plan != models.PlanPlus && plan != "premium" {
		return fmt.Errorf("unsupported paid plan %q", plan)
	}
	if userID <= 0 || months < 1 || months > 24 {
		return fmt.Errorf("invalid plan upgrade")
	}
	if err := s.userRepo.ExtendPlan(ctx, userID, plan, months); err != nil {
		return fmt.Errorf("upgrade user %d to %s: %w", userID, plan, err)
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

// IsPaid returns true if the user currently has an active Plus or Premium plan.
// On any error it conservatively returns false and logs.
func (s *PlanService) IsPaid(ctx context.Context, userID int) bool {
	plan, expiresAt, err := s.userRepo.GetPlan(ctx, userID)
	if err != nil {
		log.Printf("[plan] IsPaid check failed for user %d: %v", userID, err)
		return false
	}
	if plan != "plus" && plan != "premium" {
		return false
	}
	// Nil expiry on a subscribed plan represents a lifetime entitlement.
	if expiresAt == nil {
		return true
	}
	return expiresAt.After(time.Now())
}

// DowngradeExpired finds all users with elapsed plan expiries and moves
// them to the free tier. Called periodically by the plan expiry worker.
func (s *PlanService) DowngradeExpired(ctx context.Context) error {
	ids, err := s.userRepo.DowngradeExpiredPlans(ctx)
	if err != nil {
		return fmt.Errorf("list expired plans: %w", err)
	}
	for _, id := range ids {
		log.Printf("[plan] downgraded expired plan for user %d", id)
	}
	return nil
}
