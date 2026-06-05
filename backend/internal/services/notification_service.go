package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/websocket"
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
	notifRepo        ports.NotificationRepository
	baselineRepo     ports.UserBaselineRepository
	batchRepo        ports.NotificationBatchRepository
	settingsRepo     ports.UserSettingsRepository
	postRepo         ports.PlatformPostRepository
	commentRepo      ports.PostCommentRepository
	hub              *websocket.Hub
	velocityDetector VelocityDetector
	tokenRepo        ports.DeviceTokenRepository
	firebase         *FirebaseService
}

// NewNotificationService creates a new notification service
func NewNotificationService(
	pool *pgxpool.Pool,
	notifRepo ports.NotificationRepository,
	baselineRepo ports.UserBaselineRepository,
	batchRepo ports.NotificationBatchRepository,
	settingsRepo ports.UserSettingsRepository,
	postRepo ports.PlatformPostRepository,
	commentRepo ports.PostCommentRepository,
	tokenRepo ports.DeviceTokenRepository,
	firebase *FirebaseService,
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
		tokenRepo:    tokenRepo,
		firebase:     firebase,
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

// NotifyMessageReaction sends an in-app notification to the message author when
// someone reacts to their message. The notification is always delivered in-app;
// push delivery follows the user's ShowPushNotifications preference.
// Safe to call from a goroutine — all errors are logged and swallowed.
func (s *NotificationService) NotifyMessageReaction(
	ctx context.Context,
	message *models.Message,
	reaction *models.MessageReaction,
) {
	// Never notify the author about their own reaction
	if message.SenderID == reaction.UserID {
		return
	}

	contentType := "message"
	contentID := message.ID
	actorID := reaction.UserID

	// Use a safe fallback if the reactor's username is empty (e.g., the user
	// was deleted in the narrow window between reaction insert and notification).
	username := reaction.Username
	if username == "" {
		username = "Someone"
	}

	notif := &models.Notification{
		UserID:           message.SenderID,
		NotificationType: "message_reaction",
		ContentType:      &contentType,
		ContentID:        &contentID,
		ActorID:          &actorID,
		Message:          fmt.Sprintf("%s reacted with %s to your message", username, reaction.Emoji),
	}

	if err := s.sendNotification(ctx, notif); err != nil {
		log.Printf("[NotificationService] NotifyMessageReaction: failed for message %d actor %d: %v",
			message.ID, reaction.UserID, err)
	}
}

// NotifyMessageEdited notifies conversation participants that a message was edited.
// It skips the editor, muted conversations, online users, and deduplicates bursts.
func (s *NotificationService) NotifyMessageEdited(
	ctx context.Context,
	messageID int,
	conversationID int,
	editorID int,
	participantIDs []int,
) {
	if len(participantIDs) == 0 {
		return
	}

	editorName := "Someone"
	if err := s.pool.QueryRow(ctx, "SELECT username FROM users WHERE id = $1", editorID).Scan(&editorName); err != nil {
		editorName = "Someone"
	}

	contentType := "message"
	notificationType := "message_edited"

	for _, recipientID := range participantIDs {
		if recipientID == 0 || recipientID == editorID {
			continue
		}
		if s.hub != nil && s.hub.IsUserOnline(recipientID) {
			continue
		}
		if s.isConversationMutedForUser(ctx, conversationID, recipientID) {
			continue
		}

		contentID := messageID
		actorID := editorID
		notification := &models.Notification{
			UserID:           recipientID,
			NotificationType: notificationType,
			ContentType:      &contentType,
			ContentID:        &contentID,
			ActorID:          &actorID,
			Message:          fmt.Sprintf("%s edited a message", editorName),
		}
		inserted, err := s.insertMessageEditNotificationIfNotRecent(ctx, notification)
		if err != nil {
			log.Printf("[NotificationService] NotifyMessageEdited: failed for message %d recipient %d: %v", messageID, recipientID, err)
			continue
		}
		if inserted {
			s.deliverNotification(ctx, notification)
		}
	}
}

// NotifyThreadReply notifies thread participants (including root author) about a new reply.
// It respects user opt-in (notify_comment_replies), quiet hours, conversation mute, thread mute,
// and deduplicates rapid bursts to avoid notification spam.
func (s *NotificationService) NotifyThreadReply(
	ctx context.Context,
	conversationID int,
	threadRootID int,
	replyID int,
	replyAuthorID int,
) {
	if threadRootID <= 0 || replyID <= 0 {
		return
	}

	var rootAuthorID int
	var rootConversationID int
	if err := s.pool.QueryRow(ctx, `
		SELECT sender_id, conversation_id
		FROM messages
		WHERE id = $1
	`, threadRootID).Scan(&rootAuthorID, &rootConversationID); err != nil {
		log.Printf("[NotificationService] NotifyThreadReply: failed to load thread root %d: %v", threadRootID, err)
		return
	}
	if rootConversationID != conversationID {
		return
	}

	participants, err := s.getThreadParticipantIDs(ctx, conversationID, threadRootID)
	if err != nil {
		log.Printf("[NotificationService] NotifyThreadReply: failed to list participants for root %d: %v", threadRootID, err)
		return
	}

	replyAuthorName := "Someone"
	if err := s.pool.QueryRow(ctx, "SELECT username FROM users WHERE id = $1", replyAuthorID).Scan(&replyAuthorName); err != nil {
		replyAuthorName = "Someone"
	}

	contentType := "message"
	notificationType := "thread_reply"

	for _, recipientID := range participants {
		if recipientID == 0 || recipientID == replyAuthorID {
			continue
		}

		settings, err := s.getOrCreateSettings(ctx, recipientID)
		if err != nil {
			log.Printf("[NotificationService] NotifyThreadReply: failed to load settings for user %d: %v", recipientID, err)
			continue
		}
		if !settings.NotifyCommentReplies {
			continue
		}
		if settings.QuietHoursEnabled && isWithinQuietHours(time.Now(), settings.QuietHoursTimezone, settings.QuietHoursStartMinutes, settings.QuietHoursEndMinutes) {
			continue
		}
		if s.isConversationMutedForUser(ctx, conversationID, recipientID) || s.isThreadMutedForUser(ctx, threadRootID, recipientID) {
			continue
		}
		if settings.DailyDigest {
			if err := s.enqueueThreadReplyDigest(ctx, recipientID, threadRootID, settings.QuietHoursTimezone); err != nil {
				log.Printf("[NotificationService] NotifyThreadReply: failed to enqueue digest for root %d recipient %d: %v", threadRootID, recipientID, err)
			}
			continue
		}

		contentID := threadRootID
		actorID := replyAuthorID
		messageText := buildThreadReplyNotificationMessage(replyAuthorName, recipientID == rootAuthorID, 0)

		notification := &models.Notification{
			UserID:           recipientID,
			NotificationType: notificationType,
			ContentType:      &contentType,
			ContentID:        &contentID,
			ActorID:          &actorID,
			Message:          messageText,
		}
		inserted, err := s.insertThreadReplyNotification(ctx, conversationID, recipientID == rootAuthorID, notification, settings.BatchNotifications)
		if err != nil {
			log.Printf("[NotificationService] NotifyThreadReply: failed for root %d recipient %d: %v", threadRootID, recipientID, err)
			continue
		}
		if inserted {
			s.deliverNotification(ctx, notification)
		}
	}
}

func (s *NotificationService) getThreadParticipantIDs(ctx context.Context, conversationID int, threadRootID int) ([]int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT sender_id
		FROM messages
		WHERE conversation_id = $1
		  AND (id = $2 OR thread_root = $2)
	`, conversationID, threadRootID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	participantSet := make(map[int]struct{}, 8)
	for rows.Next() {
		var uid int
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		if uid > 0 {
			participantSet[uid] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var conversationType string
	var user1ID *int
	var user2ID *int
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(conversation_type, 'dm'), user1_id, user2_id
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType, &user1ID, &user2ID); err == nil {
		if conversationType == "mod_mail" {
			modRows, modErr := s.pool.Query(ctx, `
				SELECT user_id
				FROM conversation_participants
				WHERE conversation_id = $1
			`, conversationID)
			if modErr != nil {
				return nil, modErr
			}
			defer modRows.Close()
			for modRows.Next() {
				var uid int
				if err := modRows.Scan(&uid); err != nil {
					return nil, err
				}
				if uid > 0 {
					participantSet[uid] = struct{}{}
				}
			}
			if err := modRows.Err(); err != nil {
				return nil, err
			}
		}
		if user1ID != nil && *user1ID > 0 {
			participantSet[*user1ID] = struct{}{}
		}
		if user2ID != nil && *user2ID > 0 {
			participantSet[*user2ID] = struct{}{}
		}
	}

	participants := make([]int, 0, len(participantSet))
	for uid := range participantSet {
		participants = append(participants, uid)
	}
	return participants, nil
}

func (s *NotificationService) insertMessageEditNotificationIfNotRecent(
	ctx context.Context,
	notification *models.Notification,
) (bool, error) {
	if notification.ContentID == nil {
		return false, fmt.Errorf("content_id is required for message edit notification dedupe")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		SELECT pg_advisory_xact_lock($1::integer, $2::integer)
	`, notification.UserID, *notification.ContentID); err != nil {
		return false, err
	}

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM notifications
			WHERE user_id = $1
			  AND notification_type = 'message_edited'
			  AND content_type = 'message'
			  AND content_id = $2
			  AND created_at > NOW() - INTERVAL '2 minutes'
		)
	`, notification.UserID, *notification.ContentID).Scan(&exists); err != nil {
		return false, err
	}
	if exists {
		if err := tx.Commit(ctx); err != nil {
			return false, err
		}
		return false, nil
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO notifications (
			user_id, notification_type, content_type, content_id,
			actor_id, milestone_count, votes_per_hour, message
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`,
		notification.UserID,
		notification.NotificationType,
		notification.ContentType,
		notification.ContentID,
		notification.ActorID,
		notification.MilestoneCount,
		notification.VotesPerHour,
		notification.Message,
	).Scan(&notification.ID, &notification.CreatedAt)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (s *NotificationService) deliverNotification(ctx context.Context, notification *models.Notification) {
	// 1. Send via WebSocket if user is online
	online := false
	if s.hub != nil && s.hub.IsUserOnline(notification.UserID) {
		online = true
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

	// 2. Send via Push if appropriate
	if s.firebase != nil && s.tokenRepo != nil {
		// Check user settings for push
		settings, err := s.getOrCreateSettings(ctx, notification.UserID)
		if err != nil {
			log.Printf("Failed to get settings for user %d: %v", notification.UserID, err)
		} else if settings.ShowPushNotifications {
			// Decide if we should send push (e.g. if user is offline)
			if !online {
				// Use background context for detachment (survives request completion)
				go s.sendPushToUser(context.Background(), notification)
			}
		}
	}
}

// sendNotification creates and delivers a notification.
// Point 8: if the actor (source of the event) has blocked the recipient
// (or vice versa), the notification is silently dropped.
func (s *NotificationService) sendNotification(ctx context.Context, notification *models.Notification) error {
	if s.pool != nil && notification.ActorID != nil && *notification.ActorID != 0 {
		blocked, err := models.IsBlockedBidirectional(ctx, s.pool, *notification.ActorID, notification.UserID)
		if err != nil {
			// Fail closed: uncertain block status → drop the notification.
			// Log so the loss is observable in monitoring.
			log.Printf("notification: block check failed for actor=%d recipient=%d type=%s err=%v; dropping notification",
				*notification.ActorID, notification.UserID, notification.NotificationType, err)
			return nil
		}
		if blocked {
			return nil // drop silently — a blocked actor's action should not reach the recipient
		}
	}

	// Save to database (persistent storage)
	if err := s.notifRepo.Create(ctx, notification); err != nil {
		return err
	}

	s.deliverNotification(ctx, notification)
	return nil
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
		message := s.buildBatchNotificationMessage(batch)
		// Create notification from batch
		notification := &models.Notification{
			UserID:           batch.UserID,
			NotificationType: batch.NotificationType,
			ContentType:      &batch.ContentType,
			ContentID:        &batch.ContentID,
			VotesPerHour:     batch.VotesPerHour,
			MilestoneCount:   batch.MilestoneCount,
			Message:          message,
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

func (s *NotificationService) buildBatchNotificationMessage(batch *models.NotificationBatch) string {
	switch batch.NotificationType {
	case "post_velocity", "comment_velocity":
		if batch.VotesPerHour != nil {
			return s.buildVelocityMessage(batch.ContentType, *batch.VotesPerHour)
		}
		if batch.ContentType == "post" {
			return "Your post is trending!"
		}
		return "Your comment is trending!"
	case "post_milestone", "comment_milestone":
		if batch.MilestoneCount != nil {
			return s.buildMilestoneMessage(batch.ContentType, *batch.MilestoneCount)
		}
		if batch.ContentType == "post" {
			return "Your post reached a new milestone!"
		}
		return "Your comment reached a new milestone!"
	case "thread_reply_digest":
		if batch.MilestoneCount != nil && *batch.MilestoneCount > 0 {
			return fmt.Sprintf("%d new replies in thread", *batch.MilestoneCount)
		}
		return "You have new replies in a thread"
	default:
		return "You have a new notification"
	}
}

func (s *NotificationService) enqueueThreadReplyDigest(
	ctx context.Context,
	userID int,
	threadRootID int,
	timezone string,
) error {
	scheduledFor := nextDailyDigestRunAt(time.Now(), timezone)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		SELECT pg_advisory_xact_lock($1::integer, $2::integer)
	`, userID, threadRootID); err != nil {
		return err
	}

	var existingID int
	var existingCount int
	err = tx.QueryRow(ctx, `
		SELECT id, COALESCE(milestone_count, 0)
		FROM notification_batches
		WHERE user_id = $1
		  AND content_type = 'message'
		  AND content_id = $2
		  AND notification_type = 'thread_reply_digest'
		  AND status = 'pending'
		  AND scheduled_for = $3
		LIMIT 1
	`, userID, threadRootID, scheduledFor).Scan(&existingID, &existingCount)
	if err == nil {
		if _, err := tx.Exec(ctx, `
			UPDATE notification_batches
			SET milestone_count = $2
			WHERE id = $1
		`, existingID, existingCount+1); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO notification_batches (
			user_id, content_type, content_id, notification_type,
			milestone_count, scheduled_for, status
		)
		VALUES ($1, 'message', $2, 'thread_reply_digest', $3, $4, 'pending')
	`, userID, threadRootID, 1, scheduledFor); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func nextDailyDigestRunAt(now time.Time, tz string) time.Time {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	localNow := now.In(loc)
	nextDay := time.Date(localNow.Year(), localNow.Month(), localNow.Day()+1, 8, 0, 0, 0, loc)
	return nextDay.UTC()
}

// SendMessagePush sends a push notification for a new message (to be called by MessagesHandler)
func (s *NotificationService) SendMessagePush(ctx context.Context, senderID int, recipientID int, message *models.Message) {
	// Entire process is async to avoid blocking the chat request (P0-042-FLAW: Latency)
	go func() {
		// Use background context for detachment
		bgCtx := context.Background()

		// 1. Check user settings for push
		settings, err := s.getOrCreateSettings(bgCtx, recipientID)
		if err != nil {
			log.Printf("[Push] Failed to get settings for user %d: %v", recipientID, err)
			return
		}

		if !settings.ShowPushNotifications {
			return
		}
		if settings.QuietHoursEnabled && isWithinQuietHours(time.Now(), settings.QuietHoursTimezone, settings.QuietHoursStartMinutes, settings.QuietHoursEndMinutes) {
			return
		}
		if s.isConversationMutedForUser(bgCtx, message.ConversationID, recipientID) {
			return
		}

		// 2. Fetch sender name for title
		var senderUsername string
		err = s.pool.QueryRow(bgCtx, "SELECT username FROM users WHERE id = $1", senderID).Scan(&senderUsername)
		if err != nil {
			senderUsername = "Someone"
		}

		// 3. Prepare notification (P0-042-FLAW: Formatting)
		n := &models.Notification{
			UserID:           recipientID,
			NotificationType: "message",
			Message:          "You have a new message", // Standard body for privacy
		}

		data := map[string]string{
			"type":            "message",
			"conversation_id": fmt.Sprintf("%d", message.ConversationID),
			"message_id":      fmt.Sprintf("%d", message.ID),
			"sender_id":       fmt.Sprintf("%d", senderID),
		}

		// Title should be the sender name
		s.performPush(bgCtx, n, data, fmt.Sprintf("New message from %s", senderUsername))
	}()
}

func (s *NotificationService) isConversationMutedForUser(ctx context.Context, conversationID int, userID int) bool {
	var muted bool
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(muted, false)
		FROM conversation_notification_settings
		WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, userID).Scan(&muted)
	if err != nil {
		return false
	}
	return muted
}

func (s *NotificationService) isThreadMutedForUser(ctx context.Context, threadRootID int, userID int) bool {
	var muted bool
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(muted, false)
		FROM thread_notification_settings
		WHERE thread_root_id = $1 AND user_id = $2
	`, threadRootID, userID).Scan(&muted)
	if err != nil {
		return false
	}
	return muted
}

func (s *NotificationService) insertThreadReplyNotification(
	ctx context.Context,
	conversationID int,
	recipientIsRootAuthor bool,
	notification *models.Notification,
	batchEnabled bool,
) (bool, error) {
	if notification.ContentID == nil {
		return false, fmt.Errorf("content_id is required for thread reply notification dedupe")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		SELECT pg_advisory_xact_lock($1::integer, $2::integer)
	`, notification.UserID, *notification.ContentID); err != nil {
		return false, err
	}

	if !batchEnabled {
		err = tx.QueryRow(ctx, `
			INSERT INTO notifications (
				user_id, notification_type, content_type, content_id,
				actor_id, milestone_count, votes_per_hour, message
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, created_at
		`,
			notification.UserID,
			notification.NotificationType,
			notification.ContentType,
			notification.ContentID,
			notification.ActorID,
			notification.MilestoneCount,
			notification.VotesPerHour,
			notification.Message,
		).Scan(&notification.ID, &notification.CreatedAt)
		if err != nil {
			return false, err
		}
		if err := tx.Commit(ctx); err != nil {
			return false, err
		}
		return true, nil
	}

	var recentID int
	err = tx.QueryRow(ctx, `
		SELECT id
		FROM notifications
		WHERE user_id = $1
		  AND notification_type = 'thread_reply'
		  AND content_type = 'message'
		  AND content_id = $2
		  AND created_at > NOW() - INTERVAL '1 minute'
		ORDER BY created_at DESC
		LIMIT 1
	`, notification.UserID, *notification.ContentID).Scan(&recentID)
	if err == nil {
		replyCount, countErr := s.countRecentThreadReplies(ctx, tx, conversationID, *notification.ContentID, notification.UserID)
		if countErr != nil {
			return false, countErr
		}
		if replyCount >= 5 {
			notification.Message = buildThreadReplyNotificationMessage("", recipientIsRootAuthor, replyCount)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE notifications
			SET created_at = CURRENT_TIMESTAMP,
			    actor_id = $2,
			    message = $3,
			    read = false
			WHERE id = $1
		`, recentID, notification.ActorID, notification.Message); err != nil {
			return false, err
		}
		if err := tx.Commit(ctx); err != nil {
			return false, err
		}
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO notifications (
			user_id, notification_type, content_type, content_id,
			actor_id, milestone_count, votes_per_hour, message
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`,
		notification.UserID,
		notification.NotificationType,
		notification.ContentType,
		notification.ContentID,
		notification.ActorID,
		notification.MilestoneCount,
		notification.VotesPerHour,
		notification.Message,
	).Scan(&notification.ID, &notification.CreatedAt)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (s *NotificationService) countRecentThreadReplies(
	ctx context.Context,
	tx pgx.Tx,
	conversationID int,
	threadRootID int,
	recipientID int,
) (int, error) {
	var count int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(1)
		FROM messages
		WHERE conversation_id = $1
		  AND thread_root = $2
		  AND sender_id <> $3
		  AND sent_at > NOW() - INTERVAL '1 minute'
	`, conversationID, threadRootID, recipientID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func buildThreadReplyNotificationMessage(replyAuthorName string, recipientIsRootAuthor bool, replyCount int) string {
	if replyCount >= 5 {
		if recipientIsRootAuthor {
			return fmt.Sprintf("%d new replies in your thread", replyCount)
		}
		return fmt.Sprintf("%d new replies in a thread you're following", replyCount)
	}
	if recipientIsRootAuthor {
		return fmt.Sprintf("%s replied to your thread", replyAuthorName)
	}
	return fmt.Sprintf("%s replied in a thread", replyAuthorName)
}

func isWithinQuietHours(now time.Time, tz string, startMinutes, endMinutes int) bool {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	minutes := local.Hour()*60 + local.Minute()

	// Normal window: start < end (e.g., 09:00-17:00)
	if startMinutes < endMinutes {
		return minutes >= startMinutes && minutes < endMinutes
	}
	// Overnight window: start > end (e.g., 22:00-07:00)
	if startMinutes > endMinutes {
		return minutes >= startMinutes || minutes < endMinutes
	}
	// start == end means "no quiet hours window"
	return false
}

func (s *NotificationService) sendPushToUser(ctx context.Context, n *models.Notification) {
	data := map[string]string{
		"notification_id": fmt.Sprintf("%d", n.ID),
		"type":            n.NotificationType,
	}
	s.performPush(ctx, n, data, "")
}

// performPush is the internal helper that handles token fetching and cleanup
func (s *NotificationService) performPush(ctx context.Context, n *models.Notification, data map[string]string, overrideTitle string) {
	if s.firebase == nil {
		return
	}

	tokens, err := s.tokenRepo.GetByUserID(ctx, n.UserID)
	if err != nil {
		log.Printf("[Push] Failed to fetch device tokens for user %d: %v", n.UserID, err)
		return
	}

	if len(tokens) == 0 {
		return
	}

	title := "OmniNudge"
	if overrideTitle != "" {
		title = overrideTitle
	} else {
		// Customize title based on notification type
		switch n.NotificationType {
		case "comment_reply":
			title = "New Reply"
		case "post_milestone", "comment_milestone":
			title = "Milestone Reached!"
		case "post_velocity", "comment_velocity":
			title = "Trending Content"
		}
	}

	tokenStrings := make([]string, len(tokens))
	for i, t := range tokens {
		tokenStrings[i] = t.Token
	}

	// Use Multicast for efficiency (P0-042-FLAW: Sequential)
	response, err := s.firebase.SendMulticast(ctx, tokenStrings, title, n.Message, data)
	if err != nil {
		log.Printf("[Push] Multicast failed: %v", err)
		return
	}

	// Handle per-token failures for cleanup
	if response.FailureCount > 0 {
		for i, resp := range response.Responses {
			if !resp.Success {
				targetToken := tokens[i].Token
				if s.isTokenInvalid(resp.Error) {
					log.Printf("[Push] Removing invalid device token for user %d: %s", n.UserID, targetToken)
					_ = s.tokenRepo.DeleteByUserAndToken(context.Background(), n.UserID, targetToken)
				} else {
					log.Printf("[Push] Token failed with non-fatal error: %v", resp.Error)
				}
			}
		}
	}
}

func (s *NotificationService) isTokenInvalid(err error) bool {
	// Check for Firebase specific invalid token errors
	// In a real app, we'd use messaging.IsRegistrationTokenNotRegistered(err)
	// For now, we'll check the error string as a fallback if the SDK helpers aren't ideal
	msg := err.Error()
	return msg == "registration-token-not-registered" || msg == "invalid-registration-token"
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
