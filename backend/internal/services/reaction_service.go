package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
)

// Sentinel errors returned by ReactionService.
var (
	ErrInvalidEmoji    = errors.New("invalid emoji: must be a single non-ASCII unicode character sequence, max 100 bytes")
	ErrMessageNotFound = errors.New("message not found")
	ErrNotParticipant  = errors.New("you are not a participant in this conversation")
	ErrTooManyEmoji    = errors.New("this message already has 10 unique emoji reactions")
	ErrAlreadyReacted  = errors.New("you have already reacted with this emoji")
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
	reactionRepo *models.MessageReactionRepository
	messageRepo  *models.MessageRepository
	notifService *NotificationService
	hub          ReactionHubInterface
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
//   - Emoji must be valid (non-empty, non-ASCII, ≤100 bytes, no control chars,
//     no bidirectional override characters)
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
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAlreadyReacted
		}
		return nil, fmt.Errorf("insert reaction: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}

	// Enrich with username after commit
	_ = s.pool.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&reaction.Username)

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

// isValidEmoji returns true if s is a non-empty UTF-8 string that contains at
// least one non-ASCII rune and no null bytes, low control characters, or
// bidirectional override/control characters (which could be used for visual
// spoofing attacks such as reversing the display order of surrounding text).
//
// Accepts ZWJ sequences (U+200D), variation selectors, and skin-tone modifiers.
// Rejects: empty, >100 bytes, invalid UTF-8, ASCII-only, control chars < U+0020,
// and Unicode bidi controls U+202A–U+202E and U+2066–U+2069.
func isValidEmoji(s string) bool {
	if len(s) == 0 || len(s) > 100 {
		return false
	}
	if !utf8.ValidString(s) {
		return false
	}

	hasNonASCII := false
	for _, r := range s {
		// Reject null bytes and ASCII control characters.
		// (ZWJ U+200D = 8205 is well above 32, so it passes.)
		if r < 32 {
			return false
		}

		// Reject bidirectional override/embedding/isolate controls that could
		// be used to visually spoof the emoji or surrounding UI text:
		//   U+202A LEFT-TO-RIGHT EMBEDDING
		//   U+202B RIGHT-TO-LEFT EMBEDDING
		//   U+202C POP DIRECTIONAL FORMATTING
		//   U+202D LEFT-TO-RIGHT OVERRIDE
		//   U+202E RIGHT-TO-LEFT OVERRIDE   ← main attack vector
		//   U+2066 LEFT-TO-RIGHT ISOLATE
		//   U+2067 RIGHT-TO-LEFT ISOLATE
		//   U+2068 FIRST STRONG ISOLATE
		//   U+2069 POP DIRECTIONAL ISOLATE
		if (r >= 0x202A && r <= 0x202E) || (r >= 0x2066 && r <= 0x2069) {
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
