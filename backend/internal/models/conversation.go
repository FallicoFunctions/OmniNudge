package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Conversation represents a 1-on-1 chat between two users or a mod mail thread
type Conversation struct {
	ID               int       `json:"id"`
	User1ID          *int      `json:"user1_id,omitempty"`          // NULL for mod_mail
	User2ID          *int      `json:"user2_id,omitempty"`          // NULL for mod_mail
	User1            *User     `json:"user1,omitempty"`             // Optional populated user info
	User2            *User     `json:"user2,omitempty"`             // Optional populated user info
	CreatedAt        time.Time `json:"created_at"`
	LastMessageAt    time.Time `json:"last_message_at"`
	ConversationType string    `json:"conversation_type"`           // 'dm' or 'mod_mail'
	HubID            *int      `json:"hub_id,omitempty"`            // For mod_mail conversations
	Subject          *string   `json:"subject,omitempty"`           // For mod_mail conversations
	Status           *string   `json:"status,omitempty"`            // For mod_mail: 'open', 'archived', 'resolved'

	// Phase 2 features (not implemented yet)
	User1AutoDeleteAfter *string `json:"user1_auto_delete_after,omitempty"`
	User2AutoDeleteAfter *string `json:"user2_auto_delete_after,omitempty"`
	User1Pseudonym       *string `json:"user1_pseudonym,omitempty"`
	User2Pseudonym       *string `json:"user2_pseudonym,omitempty"`
}

// ConversationRepository handles database operations for conversations
type ConversationRepository struct {
	pool *pgxpool.Pool
}

// NewConversationRepository creates a new conversation repository
func NewConversationRepository(pool *pgxpool.Pool) *ConversationRepository {
	return &ConversationRepository{pool: pool}
}

// Create creates a new conversation between two users
// Ensures user1_id < user2_id for uniqueness
func (r *ConversationRepository) Create(ctx context.Context, user1ID, user2ID int) (*Conversation, error) {
	// Ensure user1_id < user2_id
	if user1ID > user2ID {
		user1ID, user2ID = user2ID, user1ID
	}

	conversation := &Conversation{
		User1ID:          &user1ID,
		User2ID:          &user2ID,
		ConversationType: "dm",
	}

	query := `
		INSERT INTO conversations (user1_id, user2_id)
		VALUES ($1, $2)
		ON CONFLICT (user1_id, user2_id) DO UPDATE
		SET last_message_at = CURRENT_TIMESTAMP
		RETURNING id, created_at, last_message_at
	`

	err := r.pool.QueryRow(ctx, query, user1ID, user2ID).Scan(
		&conversation.ID,
		&conversation.CreatedAt,
		&conversation.LastMessageAt,
	)

	return conversation, err
}

// GetByID retrieves a conversation by its ID
func (r *ConversationRepository) GetByID(ctx context.Context, id int) (*Conversation, error) {
	conversation := &Conversation{}

	query := `
		SELECT id, user1_id, user2_id, created_at, last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym
		FROM conversations
		WHERE id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&conversation.ID,
		&conversation.User1ID,
		&conversation.User2ID,
		&conversation.CreatedAt,
		&conversation.LastMessageAt,
		&conversation.User1AutoDeleteAfter,
		&conversation.User2AutoDeleteAfter,
		&conversation.User1Pseudonym,
		&conversation.User2Pseudonym,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return conversation, nil
}

// GetByUsers retrieves or creates a conversation between two users
func (r *ConversationRepository) GetByUsers(ctx context.Context, user1ID, user2ID int) (*Conversation, error) {
	// Ensure user1_id < user2_id
	if user1ID > user2ID {
		user1ID, user2ID = user2ID, user1ID
	}

	conversation := &Conversation{}

	query := `
		SELECT id, user1_id, user2_id, created_at, last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym
		FROM conversations
		WHERE user1_id = $1 AND user2_id = $2
	`

	err := r.pool.QueryRow(ctx, query, user1ID, user2ID).Scan(
		&conversation.ID,
		&conversation.User1ID,
		&conversation.User2ID,
		&conversation.CreatedAt,
		&conversation.LastMessageAt,
		&conversation.User1AutoDeleteAfter,
		&conversation.User2AutoDeleteAfter,
		&conversation.User1Pseudonym,
		&conversation.User2Pseudonym,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return conversation, nil
}

// GetByUserID retrieves all conversations for a specific user
func (r *ConversationRepository) GetByUserID(ctx context.Context, userID int, limit, offset int) ([]*Conversation, error) {
	query := `
		SELECT id, user1_id, user2_id, created_at, last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym,
		       conversation_type, hub_id, subject, status
		FROM conversations
		WHERE (
			-- DM conversations (including legacy conversations with NULL conversation_type)
			((conversation_type = 'dm' OR conversation_type IS NULL) AND (user1_id = $1 OR user2_id = $1))
			OR
			-- Mod mail conversations where user is a participant but NOT a moderator
			(conversation_type = 'mod_mail' AND id IN (
				SELECT conversation_id
				FROM conversation_participants
				WHERE user_id = $1 AND is_moderator = FALSE
			))
		)
		ORDER BY last_message_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*Conversation
	for rows.Next() {
		conversation := &Conversation{}
		err := rows.Scan(
			&conversation.ID,
			&conversation.User1ID,
			&conversation.User2ID,
			&conversation.CreatedAt,
			&conversation.LastMessageAt,
			&conversation.User1AutoDeleteAfter,
			&conversation.User2AutoDeleteAfter,
			&conversation.User1Pseudonym,
			&conversation.User2Pseudonym,
			&conversation.ConversationType,
			&conversation.HubID,
			&conversation.Subject,
			&conversation.Status,
		)
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}

	return conversations, rows.Err()
}

// UpdateLastMessageAt updates the last_message_at timestamp
func (r *ConversationRepository) UpdateLastMessageAt(ctx context.Context, conversationID int) error {
	query := `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, conversationID)
	return err
}

// Delete deletes a conversation and all its messages
func (r *ConversationRepository) Delete(ctx context.Context, conversationID int) error {
	query := `DELETE FROM conversations WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, conversationID)
	return err
}

// GetOtherUserID returns the ID of the other user in the conversation
// Returns 0 for mod_mail conversations (not applicable)
func (c *Conversation) GetOtherUserID(currentUserID int) int {
	if c.User1ID != nil && *c.User1ID == currentUserID && c.User2ID != nil {
		return *c.User2ID
	}
	if c.User1ID != nil {
		return *c.User1ID
	}
	return 0
}

// IsParticipant checks if a user is a participant in the conversation
// For DM conversations only (mod_mail uses conversation_participants table)
func (c *Conversation) IsParticipant(userID int) bool {
	return (c.User1ID != nil && *c.User1ID == userID) || (c.User2ID != nil && *c.User2ID == userID)
}
