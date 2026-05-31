package workers

import (
	"context"
	"log"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

const cryptoPaymentPollInterval = 2 * time.Minute

// CryptoPaymentWorker polls pending crypto payments every 2 minutes and
// confirms them once they reach the required block confirmation threshold.
// On confirmation it upgrades the user's plan automatically.
type CryptoPaymentWorker struct {
	payRepo     *models.CryptoPaymentRepository
	planSvc     *services.PlanService
	verifier    services.CryptoVerifier
}

// NewCryptoPaymentWorker creates a CryptoPaymentWorker.
func NewCryptoPaymentWorker(
	payRepo *models.CryptoPaymentRepository,
	planSvc *services.PlanService,
	verifier services.CryptoVerifier,
) *CryptoPaymentWorker {
	return &CryptoPaymentWorker{
		payRepo:  payRepo,
		planSvc:  planSvc,
		verifier: verifier,
	}
}

// Start runs the polling loop. Blocks until ctx is cancelled.
func (w *CryptoPaymentWorker) Start(ctx context.Context) {
	log.Printf("[crypto-worker] started (poll interval: %s)", cryptoPaymentPollInterval)

	// Run once immediately on startup to catch any payments that came in
	// while the server was down.
	w.processPending(ctx)

	ticker := time.NewTicker(cryptoPaymentPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[crypto-worker] stopped")
			return
		case <-ticker.C:
			w.processPending(ctx)
		}
	}
}

func (w *CryptoPaymentWorker) processPending(ctx context.Context) {
	pending, err := w.payRepo.ListPending(ctx)
	if err != nil {
		log.Printf("[crypto-worker] list pending error: %v", err)
		return
	}
	if len(pending) == 0 {
		return
	}
	log.Printf("[crypto-worker] checking %d pending payment(s)", len(pending))

	for _, payment := range pending {
		w.checkPayment(ctx, payment)
	}
}

func (w *CryptoPaymentWorker) checkPayment(ctx context.Context, payment *models.CryptoPayment) {
	result, err := w.verifier.Verify(ctx, payment.TXID, payment.Coin)
	if err != nil {
		// Transactions can take time to propagate — only fail after 24h
		age := time.Since(payment.CreatedAt)
		if age > 24*time.Hour {
			log.Printf("[crypto-worker] payment %d unverifiable after 24h, marking failed: %v", payment.ID, err)
			_ = w.payRepo.UpdateStatus(ctx, payment.ID, models.StatusFailed, 0, nil)
		} else {
			log.Printf("[crypto-worker] payment %d not yet verifiable (age: %s): %v", payment.ID, age.Round(time.Minute), err)
		}
		return
	}

	if !result.Confirmed {
		// Update confirmation count so the status endpoint shows progress
		_ = w.payRepo.UpdateStatus(ctx, payment.ID, models.StatusPending, result.Confirmations, nil)
		log.Printf("[crypto-worker] payment %d pending: %d confirmations", payment.ID, result.Confirmations)
		return
	}

	now := time.Now()
	if err := w.payRepo.UpdateStatus(ctx, payment.ID, models.StatusConfirmed, result.Confirmations, &now); err != nil {
		log.Printf("[crypto-worker] payment %d confirm status error: %v", payment.ID, err)
		return
	}

	if err := w.planSvc.Upgrade(ctx, payment.UserID, payment.PlanMonths); err != nil {
		log.Printf("[crypto-worker] payment %d plan upgrade failed for user %d: %v", payment.ID, payment.UserID, err)
		return
	}

	log.Printf("[crypto-worker] payment %d confirmed — user %d upgraded for %d month(s)", payment.ID, payment.UserID, payment.PlanMonths)
}
