package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/validation"
	"github.com/omninudge/backend/internal/websocket"
)

// Sentinel errors returned by ReactionService.
// fmt.Errorf (without %w) is used where the message embeds a constant so
// the number stays in sync automatically. errors.Is matches on pointer
// equality, which is guaranteed for package-level vars.
var (
	ErrInvalidEmoji     = fmt.Errorf("invalid emoji: must be a valid unicode emoji sequence, max %d characters and %d bytes", validation.MaxReactionEmojiChars, validation.MaxReactionEmojiBytes)
	ErrMessageNotFound  = errors.New("message not found")
	ErrNotParticipant   = errors.New("you are not a participant in this conversation")
	ErrTooManyEmoji     = fmt.Errorf("this message already has %d unique emoji reactions", models.MaxEmojiPerMessage)
	ErrAlreadyReacted   = errors.New("you have already reacted with this emoji")
	ErrReactionNotFound = errors.New("reaction not found")
	ErrNotReactionOwner = errors.New("you can only remove your own reactions")
)

// broadcastTimeout is the maximum time allowed for non-blocking background
// goroutines that broadcast WebSocket events or send notifications.
const broadcastTimeout = 30 * time.Second

// ReactionHubInterface is the subset of the WebSocket hub used by ReactionService.
type ReactionHubInterface interface {
	Broadcast(message *websocket.Message)
}

// ReactionService handles all business logic for message reactions.
type ReactionService struct {
	pool         *pgxpool.Pool
	reactionRepo ports.MessageReactionRepository
	messageRepo  ports.MessageRepository
	notifService *NotificationService
	hub          ReactionHubInterface
}

// NewReactionService creates a new ReactionService.
func NewReactionService(
	pool *pgxpool.Pool,
	reactionRepo ports.MessageReactionRepository,
	messageRepo ports.MessageRepository,
	notifService *NotificationService,
	hub ReactionHubInterface,
) *ReactionService {
	return &ReactionService{
		pool:         pool,
		reactionRepo: reactionRepo,
		messageRepo:  messageRepo,
		notifService: notifService,
		hub:          hub,
	}
}

// AddReaction adds an emoji reaction to a message.
//
// Rules enforced:
//   - Emoji must be valid (non-empty, non-ASCII, <=10 code points, <=100 bytes,
//     no control chars, no bidirectional override characters, no Unicode tag characters)
//   - The requesting user must be a participant in the conversation
//   - A message may have at most 10 distinct emoji types across all users
//   - The same user cannot add the same emoji to the same message twice (UNIQUE constraint)
//
// On success, broadcasts a "reaction_added" WebSocket event to all other
// participants and sends an in-app notification to the message author.
func (s *ReactionService) AddReaction(ctx context.Context, messageID, userID int, emoji string) (*models.MessageReaction, error) {
	// 1. Validate emoji
	if !validation.IsValidReactionEmoji(emoji) {
		return nil, ErrInvalidEmoji
	}

	// 2. Verify the message exists and the caller is a participant
	message, err := s.messageRepo.GetByID(ctx, messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}
	if message == nil {
		return nil, ErrMessageNotFound
	}

	if !message.IsParticipant(userID) {
		// mod_mail conversations store participants separately
		ok, checkErr := s.isConversationParticipant(ctx, message.ConversationID, userID)
		if checkErr != nil || !ok {
			return nil, ErrNotParticipant
		}
	}

	// 3. Enforce 10 unique-emoji-per-message cap inside a transaction.
	//    pg_advisory_xact_lock serializes concurrent AddReaction calls for the
	//    same message, preventing two requests from both passing the cap check
	//    simultaneously. The lock is automatically released on commit/rollback.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1::bigint)`, int64(messageID)); err != nil {
		return nil, fmt.Errorf("acquire emoji cap lock: %w", err)
	}

	// If this emoji type is brand-new for this message, check the cap.
	var emojiExists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM message_reactions WHERE message_id = $1 AND emoji = $2
		)
	`, messageID, emoji).Scan(&emojiExists); err != nil {
		return nil, fmt.Errorf("check emoji existence: %w", err)
	}

	if !emojiExists {
		var distinctCount int
		if err := tx.QueryRow(ctx, `
			SELECT COUNT(DISTINCT emoji) FROM message_reactions WHERE message_id = $1
		`, messageID).Scan(&distinctCount); err != nil {
			return nil, fmt.Errorf("count distinct emoji: %w", err)
		}
		if distinctCount >= models.MaxEmojiPerMessage {
			return nil, ErrTooManyEmoji
		}
	}

	// 4. Insert — ON CONFLICT DO NOTHING returns no rows if the user
	//    already reacted with this exact emoji.
	reaction := &models.MessageReaction{}
	err = tx.QueryRow(ctx, `
		INSERT INTO message_reactions (message_id, user_id, emoji)
		VALUES ($1, $2, $3)
		ON CONFLICT (message_id, user_id, emoji) DO NOTHING
		RETURNING id, message_id, user_id, emoji, created_at
	`, messageID, userID, emoji).Scan(
		&reaction.ID,
		&reaction.MessageID,
		&reaction.UserID,
		&reaction.Emoji,
		&reaction.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAlreadyReacted
		}
		return nil, fmt.Errorf("insert reaction: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}

	// Enrich with username after commit (non-fatal if user was just deleted)
	if err := s.pool.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&reaction.Username); err != nil {
		slog.Debug("reaction: username enrichment skipped", "user_id", userID, "error", err)
	}

	// 5. Broadcast reaction_added to all other participants (non-blocking).
	//    A bounded context prevents goroutine leaks on server shutdown.
	go func() {
		bctx, cancel := context.WithTimeout(context.Background(), broadcastTimeout)
		defer cancel()
		s.broadcastReactionAdded(bctx, message.ConversationID, reaction, userID)
	}()

	// 6. Notify the message author (non-blocking, skip self-reactions).
	if message.SenderID != userID && s.notifService != nil {
		go func() {
			nctx, cancel := context.WithTimeout(context.Background(), broadcastTimeout)
			defer cancel()
			s.notifService.NotifyMessageReaction(nctx, message, reaction)
		}()
	}

	return reaction, nil
}

// RemoveReaction deletes a reaction. Only the reaction owner may remove it.
// messageID is the message the reaction should belong to — it is validated
// against the loaded reaction to prevent information leakage across messages.
// Broadcasts a "reaction_removed" event to all other participants on success.
func (s *ReactionService) RemoveReaction(ctx context.Context, messageID, reactionID, userID int) error {
	// 1. Load reaction for ownership check
	reaction, err := s.reactionRepo.GetByID(ctx, reactionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrReactionNotFound
		}
		return fmt.Errorf("get reaction by id: %w", err)
	}

	// Verify the reaction belongs to the claimed message. Without this check a
	// caller could probe whether a reaction_id exists on a different message.
	if reaction.MessageID != messageID {
		return ErrReactionNotFound
	}

	if reaction.UserID != userID {
		return ErrNotReactionOwner
	}

	// We need the message to get the conversation_id for the broadcast
	message, err := s.messageRepo.GetByID(ctx, reaction.MessageID)
	if err != nil {
		return fmt.Errorf("get message for reaction broadcast: %w", err)
	}
	if message == nil {
		return fmt.Errorf("get message for reaction broadcast: message not found")
	}

	// 2. Delete
	if err := s.reactionRepo.RemoveReaction(ctx, reactionID); err != nil {
		if errors.Is(err, models.ErrNoRowsAffected) {
			// Concurrent deletion — reaction is already gone; treat as not found.
			return ErrReactionNotFound
		}
		return fmt.Errorf("remove reaction: %w", err)
	}

	// 3. Broadcast reaction_removed (non-blocking).
	go func() {
		bctx, cancel := context.WithTimeout(context.Background(), broadcastTimeout)
		defer cancel()
		s.broadcastReactionRemoved(bctx, message.ConversationID, reaction, userID)
	}()

	return nil
}

// GetReactions returns aggregated reactions for a message, ensuring the caller
// is a participant in the containing conversation. The second return value
// indicates whether the user list was truncated due to the 500-user cap.
func (s *ReactionService) GetReactions(ctx context.Context, messageID, userID int) ([]models.ReactionSummary, bool, error) {
	message, err := s.messageRepo.GetByID(ctx, messageID)
	if err != nil {
		return nil, false, ErrMessageNotFound
	}
	if message == nil {
		return nil, false, ErrMessageNotFound
	}

	if !message.IsParticipant(userID) {
		ok, checkErr := s.isConversationParticipant(ctx, message.ConversationID, userID)
		if checkErr != nil || !ok {
			return nil, false, ErrNotParticipant
		}
	}

	return s.reactionRepo.GetReactionsByMessageID(ctx, messageID, userID)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// isConversationParticipant checks the conversation_participants table
// (used for mod_mail conversations where messages have a single recipient_id).
func (s *ReactionService) isConversationParticipant(ctx context.Context, conversationID, userID int) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		)
	`, conversationID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check conversation participant: %w", err)
	}
	return exists, nil
}

// getConversationParticipants returns all user IDs who are participants in a
// conversation, covering both DM (user1_id/user2_id) and mod_mail types.
func (s *ReactionService) getConversationParticipants(ctx context.Context, conversationID int) ([]int, error) {
	// First try the conversation_participants table (mod_mail)
	rows, err := s.pool.Query(ctx, `
		SELECT user_id FROM conversation_participants WHERE conversation_id = $1
	`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("get conversation participants: %w", err)
	}
	defer rows.Close()

	var participants []int
	for rows.Next() {
		var uid int
		if err := rows.Scan(&uid); err != nil {
			return nil, fmt.Errorf("scan participant: %w", err)
		}
		participants = append(participants, uid)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate participants: %w", err)
	}

	if len(participants) > 0 {
		return participants, nil
	}

	// Fall back to DM-style conversation (user1_id / user2_id).
	// COALESCE guards against NULL in mod_mail rows that lack user1_id/user2_id.
	var user1, user2 int
	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(user1_id, 0), COALESCE(user2_id, 0)
		FROM conversations WHERE id = $1
	`, conversationID).Scan(&user1, &user2)
	if err != nil {
		return nil, fmt.Errorf("get dm participants: %w", err)
	}

	result := make([]int, 0, 2)
	if user1 != 0 {
		result = append(result, user1)
	}
	if user2 != 0 {
		result = append(result, user2)
	}
	return result, nil
}

// broadcastReactionAdded sends a "reaction_added" WebSocket event to all
// conversation participants except the user who just reacted.
func (s *ReactionService) broadcastReactionAdded(ctx context.Context, conversationID int, reaction *models.MessageReaction, senderUserID int) {
	if s.hub == nil {
		return
	}
	participants, err := s.getConversationParticipants(ctx, conversationID)
	if err != nil {
		slog.Error("reaction: broadcast reaction_added: get participants", "conversation_id", conversationID, "error", err)
		return
	}
	for _, uid := range participants {
		if uid == senderUserID {
			continue // sender gets optimistic update on the client
		}
		event := models.ReactionEvent{
			Type:           "reaction_added",
			MessageID:      reaction.MessageID,
			ConversationID: conversationID,
			Reaction:       reaction,
		}
		s.hub.Broadcast(&websocket.Message{
			RecipientID: uid,
			Type:        "reaction_added",
			Payload:     event,
		})
	}
}

// broadcastReactionRemoved sends a "reaction_removed" WebSocket event to all
// conversation participants except the user who removed the reaction.
func (s *ReactionService) broadcastReactionRemoved(ctx context.Context, conversationID int, reaction *models.MessageReaction, senderUserID int) {
	if s.hub == nil {
		return
	}
	participants, err := s.getConversationParticipants(ctx, conversationID)
	if err != nil {
		slog.Error("reaction: broadcast reaction_removed: get participants", "conversation_id", conversationID, "error", err)
		return
	}
	for _, uid := range participants {
		if uid == senderUserID {
			continue
		}
		reactionID := reaction.ID
		userID := reaction.UserID
		emoji := reaction.Emoji
		event := models.ReactionEvent{
			Type:           "reaction_removed",
			MessageID:      reaction.MessageID,
			ConversationID: conversationID,
			ReactionID:     &reactionID,
			UserID:         &userID,
			Emoji:          &emoji,
		}
		s.hub.Broadcast(&websocket.Message{
			RecipientID: uid,
			Type:        "reaction_removed",
			Payload:     event,
		})
	}
}
