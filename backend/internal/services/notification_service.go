package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// VelocityDetector is an interface for detecting unusual vote velocity
// This allows for ML-based implementations to be plugged in later
type VelocityDetector interface {
	ShouldNotify(ctx context.Context, userID int, contentType string, votesPerHour float64) (bool, error)
	IsExponentialGrowth(ctx context.Context, contentType string, contentID int, currentVPH float64) (bool, error)
}

// NotificationService handles all notification business logic
type NotificationService struct {
	pool             *pgxpool.Pool
	notifRepo        *models.NotificationRepository
	baselineRepo     *models.UserBaselineRepository
	batchRepo        *models.NotificationBatchRepository
	settingsRepo     *models.UserSettingsRepository
	postRepo         *models.PlatformPostRepository
	commentRepo      *models.PostCommentRepository
	hub              *websocket.Hub
	velocityDetector VelocityDetector
}

// NewNotificationService creates a new notification service
func NewNotificationService(
	pool *pgxpool.Pool,
	notifRepo *models.NotificationRepository,
	baselineRepo *models.UserBaselineRepository,
	batchRepo *models.NotificationBatchRepository,
	settingsRepo *models.UserSettingsRepository,
	postRepo *models.PlatformPostRepository,
	commentRepo *models.PostCommentRepository,
	hub *websocket.Hub,
) *NotificationService {
	ns := &NotificationService{
		pool:         pool,
		notifRepo:    notifRepo,
		baselineRepo: baselineRepo,
		batchRepo:    batchRepo,
		settingsRepo: settingsRepo,
		postRepo:     postRepo,
		commentRepo:  commentRepo,
		hub:          hub,
	}
	// Use rule-based detector by default, can be swapped for ML later
	ns.velocityDetector = NewRuleBasedVelocityDetector(pool, baselineRepo)
	return ns
}

// CheckAndNotifyVote processes a vote and determines if notification should be sent
// This is called after every upvote on posts/comments
func (s *NotificationService) CheckAndNotifyVote(
	ctx context.Context,
	contentType string,
	contentID int,
	authorID int,
	currentUpvotes int,
) error {
	// Get user settings to check if notifications are enabled
	settings, err := s.getOrCreateSettings(ctx, authorID)
	if err != nil {
		log.Printf("Failed to get settings for user %d: %v", authorID, err)
		return nil // Don't fail the vote operation
	}

	// Check milestone notifications
	if (contentType == "post" && settings.NotifyPostMilestone) ||
		(contentType == "comment" && settings.NotifyCommentMilestone) {
		if err := s.checkMilestoneNotification(ctx, contentType, contentID, authorID, currentUpvotes); err != nil {
			log.Printf("Milestone check failed: %v", err)
		}
	}

	// Check velocity notifications
	if (contentType == "post" && settings.NotifyPostVelocity) ||
		(contentType == "comment" && settings.NotifyCommentVelocity) {
		if err := s.checkVelocityNotification(ctx, contentType, contentID, authorID); err != nil {
			log.Printf("Velocity check failed: %v", err)
		}
	}

	return nil
}

// checkMilestoneNotification checks if content has crossed a milestone threshold
func (s *NotificationService) checkMilestoneNotification(
	ctx context.Context,
	contentType string,
	contentID int,
	authorID int,
	currentUpvotes int,
) error {
	milestones := []int{10, 50, 100, 500, 1000, 5000, 10000}

	for _, milestone := range milestones {
		if currentUpvotes >= milestone {
			// Check if we already sent this milestone notification
			exists, err := s.notifRepo.CheckMilestoneExists(ctx, authorID, contentType, contentID, milestone)
			if err != nil {
				return err
			}
			if exists {
				continue // Already notified for this milestone
			}

			// Send milestone notification
			notifType := fmt.Sprintf("%s_milestone", contentType)
			message := s.buildMilestoneMessage(contentType, milestone)

			notification := &models.Notification{
				UserID:           authorID,
				NotificationType: notifType,
				ContentType:      &contentType,
				ContentID:        &contentID,
				MilestoneCount:   &milestone,
				Message:          message,
			}

			if err := s.sendNotification(ctx, notification); err != nil {
				log.Printf("Failed to send milestone notification: %v", err)
			}
		}
	}

	return nil
}

// checkVelocityNotification checks if content is getting unusual upvote velocity
func (s *NotificationService) checkVelocityNotification(
	ctx context.Context,
	contentType string,
	contentID int,
	authorID int,
) error {
	// Calculate current velocity (votes in last 3 hours)
	votesPerHour, err := s.calculateVelocity(ctx, contentType, contentID, 3)
	if err != nil {
		return err
	}

	// Use velocity detector to determine if we should notify
	shouldNotify, err := s.velocityDetector.ShouldNotify(ctx, authorID, contentType, votesPerHour)
	if err != nil {
		return err
	}

	if !shouldNotify {
		return nil
	}

	// Check if exponential growth (determines batching)
	isExponential, err := s.velocityDetector.IsExponentialGrowth(ctx, contentType, contentID, votesPerHour)
	if err != nil {
		log.Printf("Failed to check exponential growth: %v", err)
		isExponential = false
	}

	notifType := fmt.Sprintf("%s_velocity", contentType)
	message := s.buildVelocityMessage(contentType, int(votesPerHour))
	vphInt := int(votesPerHour)

	if isExponential {
		// Send immediately for viral content
		notification := &models.Notification{
			UserID:           authorID,
			NotificationType: notifType,
			ContentType:      &contentType,
			ContentID:        &contentID,
			VotesPerHour:     &vphInt,
			Message:          message,
		}
		return s.sendNotification(ctx, notification)
	}

	// Schedule for 15 minutes later (normal batching)
	batch := &models.NotificationBatch{
		UserID:           authorID,
		ContentType:      contentType,
		ContentID:        contentID,
		NotificationType: notifType,
		VotesPerHour:     &vphInt,
		ScheduledFor:     time.Now().Add(15 * time.Minute),
		Status:           "pending",
	}

	return s.batchRepo.Create(ctx, batch)
}

// NotifyCommentReply sends a notification for comment replies
func (s *NotificationService) NotifyCommentReply(
	ctx context.Context,
	replyCommentID int,
	recipientID int,
	replyAuthorID int,
) error {
	if recipientID == replyAuthorID {
		return nil
	}
	// Get recipient settings
	settings, err := s.getOrCreateSettings(ctx, recipientID)
	if err != nil {
		log.Printf("Failed to get settings for user %d: %v", recipientID, err)
		return nil
	}

	if !settings.NotifyCommentReplies {
		return nil // User has disabled comment reply notifications
	}

	contentType := "comment"
	contentID := replyCommentID
	message := "Someone replied to your comment"
	notification := &models.Notification{
		UserID:           recipientID,
		NotificationType: "comment_reply",
		ContentType:      &contentType,
		ContentID:        &contentID,
		ActorID:          &replyAuthorID,
		Message:          message,
	}

	return s.sendNotification(ctx, notification)
}

// ProcessBatchedNotifications processes all pending notification batches
// Called by the worker every 15 minutes
func (s *NotificationService) ProcessBatchedNotifications(ctx context.Context) error {
	batches, err := s.batchRepo.GetPendingBatches(ctx, time.Now())
	if err != nil {
		return err
	}

	log.Printf("Processing %d notification batches", len(batches))

	for _, batch := range batches {
		// Create notification from batch
		notification := &models.Notification{
			UserID:           batch.UserID,
			NotificationType: batch.NotificationType,
			ContentType:      &batch.ContentType,
			ContentID:        &batch.ContentID,
			VotesPerHour:     batch.VotesPerHour,
			MilestoneCount:   batch.MilestoneCount,
			Message:          s.buildVelocityMessage(batch.ContentType, *batch.VotesPerHour),
		}

		if err := s.sendNotification(ctx, notification); err != nil {
			log.Printf("Failed to send batched notification: %v", err)
			continue
		}

		// Mark batch as processed
		if err := s.batchRepo.MarkAsProcessed(ctx, batch.ID); err != nil {
			log.Printf("Failed to mark batch as processed: %v", err)
		}
	}

	return nil
}

// sendNotification creates and delivers a notification
func (s *NotificationService) sendNotification(ctx context.Context, notification *models.Notification) error {
	// Save to database (persistent storage)
	if err := s.notifRepo.Create(ctx, notification); err != nil {
		return err
	}

	// Send via WebSocket if user is online
	if s.hub != nil && s.hub.IsUserOnline(notification.UserID) {
		s.hub.Broadcast(&websocket.Message{
			RecipientID: notification.UserID,
			Type:        "notification",
			Payload: gin.H{
				"id":                notification.ID,
				"notification_type": notification.NotificationType,
				"message":           notification.Message,
				"content_type":      notification.ContentType,
				"content_id":        notification.ContentID,
				"created_at":        notification.CreatedAt,
			},
		})
	}

	return nil
}

// calculateVelocity calculates votes per hour for content over the last N hours
func (s *NotificationService) calculateVelocity(
	ctx context.Context,
	contentType string,
	contentID int,
	hours int,
) (float64, error) {
	interval := fmt.Sprintf("%d hours", hours)
	query := `
		SELECT COUNT(*)
		FROM vote_activity
		WHERE content_type = $1
		AND content_id = $2
		AND created_at >= NOW() - $3::INTERVAL
	`

	var voteCount int
	err := s.pool.QueryRow(ctx, query, contentType, contentID, interval).Scan(&voteCount)
	if err != nil {
		return 0, err
	}

	return float64(voteCount) / float64(hours), nil
}

// getOrCreateSettings gets or creates default settings for a user
func (s *NotificationService) getOrCreateSettings(ctx context.Context, userID int) (*models.UserSettings, error) {
	settings, err := s.settingsRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if settings == nil {
		return s.settingsRepo.CreateDefault(ctx, userID)
	}
	return settings, nil
}

// buildMilestoneMessage creates a human-readable milestone message
func (s *NotificationService) buildMilestoneMessage(contentType string, milestone int) string {
	if contentType == "post" {
		return fmt.Sprintf("Your post reached %d upvotes!", milestone)
	}
	return fmt.Sprintf("Your comment reached %d upvotes!", milestone)
}

// buildVelocityMessage creates a human-readable velocity message
func (s *NotificationService) buildVelocityMessage(contentType string, votesPerHour int) string {
	if contentType == "post" {
		return fmt.Sprintf("Your post is trending! Getting %d upvotes/hour", votesPerHour)
	}
	return fmt.Sprintf("Your comment is trending! Getting %d upvotes/hour", votesPerHour)
}
