package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/rs/zerolog"
)

// Narrow repository interfaces used by AutoDeleteService. The concrete
// *models.ConversationRepository and *models.MessageRepository satisfy both.

type autoDeleteConvRepo interface {
	GetByID(ctx context.Context, id int) (*models.Conversation, error)
	GetEffectiveAutoDelete(ctx context.Context, userID, conversationID int) (*time.Duration, error)
}

type autoDeleteMsgRepo interface {
	Create(ctx context.Context, msg *models.Message) error
}

// AutoDeleteService manages the sender-controlled message auto-delete feature.
// Each user's messages expire according to their effective setting for the conversation:
// per-chat override takes priority over the global user setting; nil means Never.
type AutoDeleteService struct {
	pool        *pgxpool.Pool
	convRepo    autoDeleteConvRepo
	msgRepo     autoDeleteMsgRepo
	hub         *websocket.Hub
	logger      zerolog.Logger
	shutdownCtx context.Context
}

func NewAutoDeleteService(
	pool *pgxpool.Pool,
	convRepo autoDeleteConvRepo,
	msgRepo autoDeleteMsgRepo,
	hub *websocket.Hub,
	logger zerolog.Logger,
	shutdownCtx context.Context,
) *AutoDeleteService {
	return &AutoDeleteService{
		pool:        pool,
		convRepo:    convRepo,
		msgRepo:     msgRepo,
		hub:         hub,
		logger:      logger,
		shutdownCtx: shutdownCtx,
	}
}

// GetEffectiveSetting returns the effective auto-delete duration for userID in conversationID.
// Per-chat override takes priority over the global setting; nil means Never.
func (s *AutoDeleteService) GetEffectiveSetting(ctx context.Context, userID, conversationID int) (*time.Duration, error) {
	return s.convRepo.GetEffectiveAutoDelete(ctx, userID, conversationID)
}

// ComputeDeleteAt resolves the effective auto-delete setting for senderID in conversationID
// and returns sentAt + interval, or nil when the effective setting is Never.
func (s *AutoDeleteService) ComputeDeleteAt(ctx context.Context, senderID, conversationID int, sentAt time.Time) (*time.Time, error) {
	d, err := s.convRepo.GetEffectiveAutoDelete(ctx, senderID, conversationID)
	if err != nil {
		return nil, fmt.Errorf("auto_delete: resolve effective setting: %w", err)
	}
	if d == nil {
		return nil, nil
	}
	t := sentAt.Add(*d)
	return &t, nil
}

// UpdateGlobalSetting persists the user's global auto-delete preference.
// When applyRetroactive is true a background job is enqueued to recalculate
// delete_at on all existing sent messages that are not covered by a per-chat override.
// Passing nil for interval sets the setting to Never.
func (s *AutoDeleteService) UpdateGlobalSetting(ctx context.Context, userID int, interval *time.Duration, applyRetroactive bool) error {
	var pgInterval interface{}
	if interval != nil {
		pgInterval = fmt.Sprintf("%d seconds", int64(interval.Seconds()))
	}

	_, err := s.pool.Exec(ctx, `
		INSERT INTO user_settings (user_id, default_auto_delete_after, updated_at)
		VALUES ($1, $2::interval, NOW())
		ON CONFLICT (user_id)
		DO UPDATE SET default_auto_delete_after = $2::interval, updated_at = NOW()
	`, userID, pgInterval)
	if err != nil {
		return fmt.Errorf("auto_delete: update global setting: %w", err)
	}

	if applyRetroactive && interval != nil {
		go s.applyGlobalRetroactiveAsync(userID, *interval)
	}

	// Inject a system message into every DM and group chat for this user that does
	// not already have a per-chat override, so other participants see the change.
	// Skipped when interval is nil (Never produces no system message).
	if interval != nil {
		if err := s.injectGlobalSystemMessages(ctx, userID, *interval); err != nil {
			// Log but do not fail the setting update itself.
			s.logger.Warn().Err(err).Int("user_id", userID).Msg("auto_delete: failed to inject global system messages")
		}
	}

	return nil
}

// UpdateChatSetting persists a per-chat auto-delete override for userID in conversationID.
// When applyRetroactive is true, delete_at is synchronously recalculated for all existing
// messages the user sent in this conversation.
// Passing nil for interval clears the per-chat override (falls back to global setting).
func (s *AutoDeleteService) UpdateChatSetting(ctx context.Context, userID, conversationID int, interval *time.Duration, applyRetroactive bool) error {
	var pgInterval interface{}
	if interval != nil {
		pgInterval = fmt.Sprintf("%d seconds", int64(interval.Seconds()))
	}

	conv, err := s.convRepo.GetByID(ctx, conversationID)
	if err != nil {
		return fmt.Errorf("auto_delete: fetch conversation: %w", err)
	}
	if conv == nil {
		return fmt.Errorf("auto_delete: conversation %d not found", conversationID)
	}

	switch conv.ConversationType {
	case "dm", "":
		var col string
		if conv.User1ID != nil && *conv.User1ID == userID {
			col = "user1_auto_delete_after"
		} else {
			col = "user2_auto_delete_after"
		}
		_, err = s.pool.Exec(ctx,
			fmt.Sprintf(`UPDATE conversations SET %s = $1::interval WHERE id = $2`, col),
			pgInterval, conversationID,
		)
	case "group":
		_, err = s.pool.Exec(ctx, `
			UPDATE conversation_participants
			SET auto_delete_after = $1::interval
			WHERE conversation_id = $2 AND user_id = $3
		`, pgInterval, conversationID, userID)
	default:
		return fmt.Errorf("auto_delete: unsupported conversation type %q", conv.ConversationType)
	}
	if err != nil {
		return fmt.Errorf("auto_delete: persist per-chat setting: %w", err)
	}

	if applyRetroactive && interval != nil {
		if err := s.applyRetroactiveForChat(ctx, userID, conversationID, *interval); err != nil {
			s.logger.Warn().Err(err).
				Int("user_id", userID).
				Int("conversation_id", conversationID).
				Msg("auto_delete: retroactive recalculation failed")
		}
	}

	if interval != nil {
		username, _ := s.fetchUsername(ctx, userID)
		s.InjectAutoDeleteSystemMessage(ctx, conversationID, userID, username, *interval)
	}

	return nil
}

// InjectAutoDeleteSystemMessage inserts a system message into the conversation timeline
// and broadcasts it to all connected participants. It does NOT trigger push notifications.
// Call only when interval is non-nil ("Never" produces no system message).
func (s *AutoDeleteService) InjectAutoDeleteSystemMessage(ctx context.Context, conversationID, senderID int, username string, interval time.Duration) {
	content := fmt.Sprintf("%s has messages set to auto-delete after %s", username, formatInterval(interval))

	msg := &models.Message{
		ConversationID:   conversationID,
		SenderID:         senderID,
		RecipientID:      0, // system message; recipient not applicable
		EncryptedContent: content,
		MessageType:      "system",
		EncryptionVersion: "v1",
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		s.logger.Warn().Err(err).
			Int("conversation_id", conversationID).
			Msg("auto_delete: failed to insert system message")
		return
	}

	participantIDs, err := s.getConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		s.logger.Warn().Err(err).Int("conversation_id", conversationID).Msg("auto_delete: failed to fetch participants for system message broadcast")
		return
	}

	s.hub.BroadcastToUsers(participantIDs, "new_message", map[string]interface{}{
		"message_id":      msg.ID,
		"conversation_id": conversationID,
		"message_type":    "system",
		"content":         content,
		"sent_at":         msg.SentAt,
	})
}

// applyRetroactiveForChat recalculates delete_at for all messages sent by userID
// in conversationID, using sentAt + interval from the original send time.
func (s *AutoDeleteService) applyRetroactiveForChat(ctx context.Context, userID, conversationID int, interval time.Duration) error {
	pgInterval := fmt.Sprintf("%d seconds", int64(interval.Seconds()))
	_, err := s.pool.Exec(ctx, `
		UPDATE messages
		SET delete_at = sent_at + $1::interval
		WHERE conversation_id = $2
		  AND sender_id = $3
		  AND deleted_for_sender = FALSE
		  AND deleted_for_recipient = FALSE
	`, pgInterval, conversationID, userID)
	if err != nil {
		return fmt.Errorf("auto_delete: retroactive chat update: %w", err)
	}
	return nil
}

// applyGlobalRetroactiveAsync runs in a goroutine and recalculates delete_at on all
// messages sent by userID in conversations that have no per-chat override set for them.
func (s *AutoDeleteService) applyGlobalRetroactiveAsync(userID int, interval time.Duration) {
	ctx := s.shutdownCtx
	pgInterval := fmt.Sprintf("%d seconds", int64(interval.Seconds()))

	_, err := s.pool.Exec(ctx, `
		UPDATE messages m
		SET delete_at = m.sent_at + $1::interval
		FROM conversations c
		LEFT JOIN conversation_participants cp
			ON cp.conversation_id = c.id AND cp.user_id = $2
		WHERE m.sender_id = $2
		  AND m.conversation_id = c.id
		  AND m.deleted_for_sender = FALSE
		  AND m.deleted_for_recipient = FALSE
		  AND (
		    -- DM: no per-chat override for this user
		    (COALESCE(c.conversation_type, 'dm') = 'dm'
		     AND CASE
		           WHEN c.user1_id = $2 THEN c.user1_auto_delete_after
		           WHEN c.user2_id = $2 THEN c.user2_auto_delete_after
		           ELSE NULL
		         END IS NULL)
		    OR
		    -- Group: no per-chat override for this participant
		    (c.conversation_type = 'group' AND cp.auto_delete_after IS NULL)
		  )
	`, pgInterval, userID)
	if err != nil {
		s.logger.Error().Err(err).Int("user_id", userID).Msg("auto_delete: global retroactive update failed")
	}
}

// injectGlobalSystemMessages fires InjectAutoDeleteSystemMessage for every conversation
// where the user is a participant and has no per-chat override.
func (s *AutoDeleteService) injectGlobalSystemMessages(ctx context.Context, userID int, interval time.Duration) error {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT m.conversation_id
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		LEFT JOIN conversation_participants cp
			ON cp.conversation_id = c.id AND cp.user_id = $1
		WHERE m.sender_id = $1
		  AND (
		    (COALESCE(c.conversation_type, 'dm') = 'dm'
		     AND CASE
		           WHEN c.user1_id = $1 THEN c.user1_auto_delete_after
		           WHEN c.user2_id = $1 THEN c.user2_auto_delete_after
		           ELSE NULL
		         END IS NULL)
		    OR (c.conversation_type = 'group' AND cp.auto_delete_after IS NULL)
		  )
	`, userID)
	if err != nil {
		return fmt.Errorf("auto_delete: list conversations for system messages: %w", err)
	}
	defer rows.Close()

	username, _ := s.fetchUsername(ctx, userID)
	for rows.Next() {
		var convID int
		if err := rows.Scan(&convID); err != nil {
			return err
		}
		s.InjectAutoDeleteSystemMessage(ctx, convID, userID, username, interval)
	}
	return rows.Err()
}

// getConversationParticipantIDs returns all user IDs in a conversation.
func (s *AutoDeleteService) getConversationParticipantIDs(ctx context.Context, conversationID int) ([]int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT user_id FROM conversation_participants WHERE conversation_id = $1
	`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var uid int
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		ids = append(ids, uid)
	}
	if len(ids) > 0 {
		return ids, rows.Err()
	}

	// DM: fall back to user1_id / user2_id on conversations table.
	conv, err := s.convRepo.GetByID(ctx, conversationID)
	if err != nil || conv == nil {
		return ids, err
	}
	if conv.User1ID != nil {
		ids = append(ids, *conv.User1ID)
	}
	if conv.User2ID != nil {
		ids = append(ids, *conv.User2ID)
	}
	return ids, nil
}

// fetchUsername returns the username for a user, falling back to "A user" on error.
func (s *AutoDeleteService) fetchUsername(ctx context.Context, userID int) (string, error) {
	var username string
	err := s.pool.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username)
	if err != nil {
		return "A user", err
	}
	return username, nil
}

// formatInterval converts a duration to a human-readable string.
func formatInterval(d time.Duration) string {
	switch {
	case d == 30*time.Minute:
		return "30 minutes"
	case d == time.Hour:
		return "1 hour"
	case d == 5*time.Hour:
		return "5 hours"
	case d == 24*time.Hour:
		return "1 day"
	case d == 48*time.Hour:
		return "2 days"
	case d == 7*24*time.Hour:
		return "7 days"
	case d == 30*24*time.Hour:
		return "30 days"
	default:
		hours := int(d.Hours())
		if hours < 24 {
			return fmt.Sprintf("%d hours", hours)
		}
		return fmt.Sprintf("%d days", hours/24)
	}
}
