package workers

import (
	"context"
	"log"
	"time"

	"github.com/chatreddit/backend/internal/services"
)

// WorkerManager manages all background workers
type WorkerManager struct {
	notificationService *services.NotificationService
	baselineService     *services.BaselineCalculatorService
}

// NewWorkerManager creates a new worker manager
func NewWorkerManager(
	notificationService *services.NotificationService,
	baselineService     *services.BaselineCalculatorService,
) *WorkerManager {
	return &WorkerManager{
		notificationService: notificationService,
		baselineService:     baselineService,
	}
}

// Start starts all background workers
func (wm *WorkerManager) Start(ctx context.Context) {
	log.Println("Starting background workers...")

	// Start notification batch processor (every 15 minutes)
	go wm.runNotificationBatchProcessor(ctx)

	// Start baseline calculator (daily at 3 AM)
	go wm.runBaselineCalculator(ctx)

	// Start vote activity cleanup (daily at 4 AM)
	go wm.runVoteActivityCleanup(ctx)

	log.Println("All background workers started")
}

// runNotificationBatchProcessor processes pending notification batches every 15 minutes
func (wm *WorkerManager) runNotificationBatchProcessor(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	log.Println("Notification batch processor started (15-minute interval)")

	// Run immediately on startup
	if err := wm.notificationService.ProcessBatchedNotifications(ctx); err != nil {
		log.Printf("Error processing notification batches: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			log.Println("Notification batch processor stopped")
			return
		case <-ticker.C:
			log.Println("Processing notification batches...")
			if err := wm.notificationService.ProcessBatchedNotifications(ctx); err != nil {
				log.Printf("Error processing notification batches: %v", err)
			}
		}
	}
}

// runBaselineCalculator calculates user baselines daily at 3 AM
func (wm *WorkerManager) runBaselineCalculator(ctx context.Context) {
	log.Println("Baseline calculator started (daily at 3 AM)")

	for {
		// Calculate next 3 AM
		now := time.Now()
		next3AM := time.Date(now.Year(), now.Month(), now.Day(), 3, 0, 0, 0, now.Location())
		if now.After(next3AM) {
			// If it's already past 3 AM today, schedule for tomorrow
			next3AM = next3AM.Add(24 * time.Hour)
		}

		duration := time.Until(next3AM)
		log.Printf("Next baseline calculation scheduled at %s (in %s)", next3AM.Format("2006-01-02 15:04:05"), duration)

		select {
		case <-ctx.Done():
			log.Println("Baseline calculator stopped")
			return
		case <-time.After(duration):
			log.Println("Running baseline calculation...")
			if err := wm.baselineService.CalculateBaselines(ctx); err != nil {
				log.Printf("Error calculating baselines: %v", err)
			}
		}
	}
}

// runVoteActivityCleanup cleans up old vote activity records daily at 4 AM
func (wm *WorkerManager) runVoteActivityCleanup(ctx context.Context) {
	log.Println("Vote activity cleanup started (daily at 4 AM)")

	for {
		// Calculate next 4 AM
		now := time.Now()
		next4AM := time.Date(now.Year(), now.Month(), now.Day(), 4, 0, 0, 0, now.Location())
		if now.After(next4AM) {
			// If it's already past 4 AM today, schedule for tomorrow
			next4AM = next4AM.Add(24 * time.Hour)
		}

		duration := time.Until(next4AM)
		log.Printf("Next vote activity cleanup scheduled at %s (in %s)", next4AM.Format("2006-01-02 15:04:05"), duration)

		select {
		case <-ctx.Done():
			log.Println("Vote activity cleanup stopped")
			return
		case <-time.After(duration):
			log.Println("Running vote activity cleanup...")
			if err := wm.baselineService.CleanupOldVoteActivity(ctx); err != nil {
				log.Printf("Error cleaning up vote activity: %v", err)
			}
		}
	}
}
