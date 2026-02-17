package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNoRowsAffected is returned by write operations when the target row no
// longer exists at the time of deletion. This typically indicates a concurrent
// operation removed the row between the caller's existence check and the delete.
var ErrNoRowsAffected = errors.New("no rows affected")

// MessageReaction represents a single emoji reaction on a message.
type MessageReaction struct {
	ID        int       `json:"id"`
	MessageID int       `json:"message_id"`
	UserID    int       `json:"user_id"`
	Username  string    `json:"username,omitempty"`
	Emoji     string    `json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
}

// ReactionSummary aggregates all reactions of the same emoji on a message.
type ReactionSummary struct {
	Emoji       string   `json:"emoji"`
	Count       int      `json:"count"`
	UserIDs     []int    `json:"user_ids"`
	Usernames   []string `json:"usernames"`
	UserReacted bool     `json:"user_reacted"`
}

// MessageReactionRepository handles all database operations for message reactions.
type MessageReactionRepository struct {
	pool *pgxpool.Pool
}

// NewMessageReactionRepository creates a new reaction repository.
func NewMessageReactionRepository(pool *pgxpool.Pool) *MessageReactionRepository {
	return &MessageReactionRepository{pool: pool}
}

// GetByID retrieves a single reaction by ID (used for authorization checks before delete).
func (r *MessageReactionRepository) GetByID(ctx context.Context, id int) (*MessageReaction, error) {
	reaction := &MessageReaction{}
	err := r.pool.QueryRow(ctx, `
		SELECT mr.id, mr.message_id, mr.user_id, u.username, mr.emoji, mr.created_at
		FROM message_reactions mr
		JOIN users u ON mr.user_id = u.id
		WHERE mr.id = $1
	`, id).Scan(
		&reaction.ID,
		&reaction.MessageID,
		&reaction.UserID,
		&reaction.Username,
		&reaction.Emoji,
		&reaction.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get reaction by id: %w", err)
	}
	return reaction, nil
}

// AddReaction inserts a new reaction and returns the created row.
// The UNIQUE constraint silently prevents double-reactions (returns ErrNoRows on DO NOTHING).
func (r *MessageReactionRepository) AddReaction(ctx context.Context, messageID, userID int, emoji string) (*MessageReaction, error) {
	reaction := &MessageReaction{}
	err := r.pool.QueryRow(ctx, `
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
		return nil, fmt.Errorf("insert reaction: %w", err)
	}

	// Enrich with username — non-fatal if missing
	_ = r.pool.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&reaction.Username)

	return reaction, nil
}

// RemoveReaction permanently deletes a reaction row.
// Returns ErrNoRowsAffected if the row was already deleted (concurrent deletion).
func (r *MessageReactionRepository) RemoveReaction(ctx context.Context, reactionID int) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM message_reactions WHERE id = $1`, reactionID)
	if err != nil {
		return fmt.Errorf("delete reaction: %w", err)
	}
	if ct.RowsAffected() == 0 {
		return ErrNoRowsAffected
	}
	return nil
}

// GetReactionsByMessageID returns aggregated reaction summaries for a message,
// ordered by reaction count descending (most popular first), then first-seen ascending.
// viewerID is used to populate the user_reacted flag.
//
// The second return value is true when the combined user list across all emoji
// exceeds 500 entries and was truncated. Callers should surface this to clients
// so they know the lists are not exhaustive.
func (r *MessageReactionRepository) GetReactionsByMessageID(ctx context.Context, messageID, viewerID int) ([]ReactionSummary, bool, error) {
	// Step 1: Per-emoji aggregates (count + whether the viewer reacted)
	rows, err := r.pool.Query(ctx, `
		SELECT emoji, COUNT(*) AS count, BOOL_OR(user_id = $2) AS user_reacted
		FROM message_reactions
		WHERE message_id = $1
		GROUP BY emoji
		ORDER BY count DESC, MIN(created_at) ASC
		LIMIT 10
	`, messageID, viewerID)
	if err != nil {
		return nil, false, fmt.Errorf("get reaction summaries: %w", err)
	}
	defer rows.Close()

	// Build an ordered map of emoji → summary
	summaryMap := make(map[string]*ReactionSummary)
	emojiOrder := make([]string, 0, 10)

	for rows.Next() {
		s := &ReactionSummary{}
		if err := rows.Scan(&s.Emoji, &s.Count, &s.UserReacted); err != nil {
			return nil, false, fmt.Errorf("scan reaction summary: %w", err)
		}
		summaryMap[s.Emoji] = s
		emojiOrder = append(emojiOrder, s.Emoji)
	}
	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("iterate reaction summaries: %w", err)
	}

	if len(emojiOrder) == 0 {
		return []ReactionSummary{}, false, nil
	}

	// Step 2: Enrich each summary with the list of users who reacted.
	// Query LIMIT+1 so we can detect truncation without an extra COUNT query.
	const userListCap = 500
	userRows, err := r.pool.Query(ctx, `
		SELECT mr.emoji, mr.user_id, u.username
		FROM message_reactions mr
		JOIN users u ON mr.user_id = u.id
		WHERE mr.message_id = $1
		ORDER BY mr.created_at ASC
		LIMIT $2
	`, messageID, userListCap+1)
	if err != nil {
		return nil, false, fmt.Errorf("get reaction users: %w", err)
	}
	defer userRows.Close()

	scanned := 0
	for userRows.Next() {
		scanned++
		if scanned > userListCap {
			// Drain the cursor so the connection returns cleanly, then stop.
			continue
		}
		var emoji, username string
		var userID int
		if err := userRows.Scan(&emoji, &userID, &username); err != nil {
			return nil, false, fmt.Errorf("scan reaction user: %w", err)
		}
		if s, ok := summaryMap[emoji]; ok {
			s.UserIDs = append(s.UserIDs, userID)
			s.Usernames = append(s.Usernames, username)
		}
	}
	if err := userRows.Err(); err != nil {
		return nil, false, fmt.Errorf("iterate reaction users: %w", err)
	}

	truncated := scanned > userListCap

	// Return summaries in the original order (most-popular first)
	result := make([]ReactionSummary, 0, len(emojiOrder))
	for _, emoji := range emojiOrder {
		result = append(result, *summaryMap[emoji])
	}
	return result, truncated, nil
}
