package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
)

// Sentinel errors returned by ReactionService.
var (
	ErrInvalidEmoji   = errors.New("invalid emoji: must be a single non-ASCII unicode character sequence, max 100 bytes")
	ErrMessageNotFound = errors.New("message not found")
	ErrNotParticipant  = errors.New("you are not a participant in this conversation")
	ErrTooManyEmoji    = errors.New("this message already has 10 unique emoji reactions")
	ErrAlreadyReacted  = errors.New("you have already reacted with this emoji")
	ErrReactionNotFound = errors.New("reaction not found")
	ErrNotReactionOwner = errors.New("you can only remove your own reactions")
)

// ReactionHubInterface is the subset of the WebSocket hub used by ReactionService.
type ReactionHubInterface interface {
	Broadcast(message *websocket.Message)
}

// ReactionService handles all business logic for message reactions.
type ReactionService struct {
	pool             *pgxpool.Pool
	reactionRepo     *models.MessageReactionRepository
	messageRepo      *models.MessageRepository
	notifService     *NotificationService
	hub              ReactionHubInterface
}

// NewReactionService creates a new ReactionService.
func NewReactionService(
	pool *pgxpool.Pool,
	reactionRepo *models.MessageReactionRepository,
	messageRepo *models.MessageRepository,
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
//   - Emoji must be valid (non-empty, non-ASCII, ≤100 bytes, no control chars)
//   - The requesting user must be a participant in the conversation
//   - A message may have at most 10 distinct emoji types across all users
//   - The same user cannot add the same emoji to the same message twice (UNIQUE constraint)
//
// On success, broadcasts a "reaction_added" WebSocket event to all other
// participants and sends an in-app notification to the message author.
func (s *ReactionService) AddReaction(ctx context.Context, messageID, userID int, emoji string) (*models.MessageReaction, error) {
	// 1. Validate emoji
	if !isValidEmoji(emoji) {
		return nil, ErrInvalidEmoji
	}

	// 2. Verify the message exists and the caller is a participant
	message, err := s.messageRepo.GetByID(ctx, messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}

	if !message.IsParticipant(userID) {
		// mod_mail conversations store participants separately
		ok, checkErr := s.isConversationParticipant(ctx, message.ConversationID, userID)
		if checkErr != nil || !ok {
			return nil, ErrNotParticipant
		}
	}

	// 3. Enforce 10 unique-emoji-per-message cap inside a transaction to
	//    minimise (but not fully eliminate) the race window.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

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
		if distinctCount >= 10 {
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
		if err.Error() == "no rows in result set" {
			return nil, ErrAlreadyReacted
		}
		return nil, fmt.Errorf("insert reaction: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}

	// Enrich with username after commit
	_ = s.pool.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&reaction.Username)

	// 5. Broadcast reaction_added to all other participants (non-blocking)
	go s.broadcastReactionAdded(context.Background(), message.ConversationID, reaction, userID)

	// 6. Notify the message author (non-blocking, skip self-reactions)
	if message.SenderID != userID && s.notifService != nil {
		go s.notifService.NotifyMessageReaction(context.Background(), message, reaction)
	}

	return reaction, nil
}

// RemoveReaction deletes a reaction. Only the reaction owner may remove it.
// Broadcasts a "reaction_removed" event to all other participants on success.
func (s *ReactionService) RemoveReaction(ctx context.Context, reactionID, userID int) error {
	// 1. Load reaction for ownership check
	reaction, err := s.reactionRepo.GetByID(ctx, reactionID)
	if err != nil {
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

	// 2. Delete
	if err := s.reactionRepo.RemoveReaction(ctx, reactionID); err != nil {
		return fmt.Errorf("remove reaction: %w", err)
	}

	// 3. Broadcast reaction_removed (non-blocking)
	go s.broadcastReactionRemoved(context.Background(), message.ConversationID, reaction, userID)

	return nil
}

// GetReactions returns aggregated reactions for a message, ensuring the caller
// is a participant in the containing conversation.
func (s *ReactionService) GetReactions(ctx context.Context, messageID, userID int) ([]models.ReactionSummary, error) {
	message, err := s.messageRepo.GetByID(ctx, messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}

	if !message.IsParticipant(userID) {
		ok, checkErr := s.isConversationParticipant(ctx, message.ConversationID, userID)
		if checkErr != nil || !ok {
			return nil, ErrNotParticipant
		}
	}

	return s.reactionRepo.GetReactionsByMessageID(ctx, messageID, userID)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// isValidEmoji returns true if s is a non-empty UTF-8 string that contains at
// least one non-ASCII rune and no null bytes or low control characters.
// Accepts ZWJ sequences (U+200D), variation selectors, and skin-tone modifiers.
func isValidEmoji(s string) bool {
	if len(s) == 0 || len(s) > 100 {
		return false
	}
	if !utf8.ValidString(s) {
		return false
	}

	hasNonASCII := false
	for _, r := range s {
		// Reject null bytes and ASCII control characters
		// (ZWJ U+200D = 8205 is well above 32, so it passes)
		if r < 32 {
			return false
		}
		if r > 127 {
			hasNonASCII = true
		}
	}
	return hasNonASCII
}

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

	// Fall back to DM-style conversation (user1_id / user2_id)
	var user1, user2 int
	err = s.pool.QueryRow(ctx, `
		SELECT user1_id, user2_id FROM conversations WHERE id = $1
	`, conversationID).Scan(&user1, &user2)
	if err != nil {
		return nil, fmt.Errorf("get dm participants: %w", err)
	}
	return []int{user1, user2}, nil
}

// broadcastReactionAdded sends a "reaction_added" WebSocket event to all
// conversation participants except the user who just reacted.
func (s *ReactionService) broadcastReactionAdded(ctx context.Context, conversationID int, reaction *models.MessageReaction, senderUserID int) {
	if s.hub == nil {
		return
	}
	participants, err := s.getConversationParticipants(ctx, conversationID)
	if err != nil {
		log.Printf("[ReactionService] broadcastReactionAdded: failed to get participants for conv %d: %v", conversationID, err)
		return
	}
	for _, uid := range participants {
		if uid == senderUserID {
			continue // sender gets optimistic update on the client
		}
		s.hub.Broadcast(&websocket.Message{
			RecipientID: uid,
			Type:        "reaction_added",
			Payload: gin.H{
				"message_id":      reaction.MessageID,
				"conversation_id": conversationID,
				"reaction":        reaction,
			},
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
		log.Printf("[ReactionService] broadcastReactionRemoved: failed to get participants for conv %d: %v", conversationID, err)
		return
	}
	for _, uid := range participants {
		if uid == senderUserID {
			continue
		}
		s.hub.Broadcast(&websocket.Message{
			RecipientID: uid,
			Type:        "reaction_removed",
			Payload: gin.H{
				"message_id":      reaction.MessageID,
				"conversation_id": conversationID,
				"reaction_id":     reaction.ID,
				"user_id":         reaction.UserID,
				"emoji":           reaction.Emoji,
			},
		})
	}
}
