package workers

import (
	"context"
	"log"
	"time"

	"github.com/omninudge/backend/internal/services"
)

const planExpiryCheckInterval = 1 * time.Hour

// PlanExpiryWorker runs hourly and downgrades users whose paid plan has
// elapsed. It is intentionally simple: no advisory lock needed since
// UpdatePlan is idempotent (downgrading an already-free user is a no-op).
type PlanExpiryWorker struct {
	planSvc *services.PlanService
}

// NewPlanExpiryWorker creates a PlanExpiryWorker.
func NewPlanExpiryWorker(planSvc *services.PlanService) *PlanExpiryWorker {
	return &PlanExpiryWorker{planSvc: planSvc}
}

// Start runs the expiry check loop. Blocks until ctx is cancelled.
func (w *PlanExpiryWorker) Start(ctx context.Context) {
	log.Printf("[plan-expiry-worker] started (check interval: %s)", planExpiryCheckInterval)

	// Run immediately so recently-expired plans are caught on restart.
	w.runCheck(ctx)

	ticker := time.NewTicker(planExpiryCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[plan-expiry-worker] stopped")
			return
		case <-ticker.C:
			w.runCheck(ctx)
		}
	}
}

func (w *PlanExpiryWorker) runCheck(ctx context.Context) {
	if err := w.planSvc.DowngradeExpired(ctx); err != nil {
		log.Printf("[plan-expiry-worker] error: %v", err)
	}
}
