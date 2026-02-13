package websocket

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Authorizer checks if users are authorized to access conversations
type Authorizer struct {
	db *pgxpool.Pool
}

// NewAuthorizer creates a new authorizer
func NewAuthorizer(db *pgxpool.Pool) *Authorizer {
	return &Authorizer{db: db}
}

// CanAccessConversation checks if user is a member of the conversation
func (a *Authorizer) CanAccessConversation(ctx context.Context, userID, conversationID int) (bool, error) {
	var exists bool
	err := a.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		)
	`, conversationID, userID).Scan(&exists)

	if err != nil {
		return false, fmt.Errorf("failed to check conversation access: %w", err)
	}

	if !exists {
		log.Printf("[SECURITY] Unauthorized conversation access attempt: user_id=%d, conversation_id=%d", userID, conversationID)
	}

	return exists, nil
}

// ListConversationParticipantIDs returns user IDs for all participants in a conversation.
func (a *Authorizer) ListConversationParticipantIDs(ctx context.Context, conversationID int) ([]int, error) {
	rows, err := a.db.Query(ctx, `
		SELECT user_id
		FROM conversation_participants
		WHERE conversation_id = $1
	`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("failed to list conversation participants: %w", err)
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to scan conversation participant id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed while iterating conversation participants: %w", err)
	}

	return ids, nil
}

// CanSendMessage checks if user can send a message to a conversation
func (a *Authorizer) CanSendMessage(ctx context.Context, userID, conversationID int) (bool, error) {
	// Check if user is in conversation
	canAccess, err := a.CanAccessConversation(ctx, userID, conversationID)
	if err != nil || !canAccess {
		return false, err
	}

	// Check if user is blocked by any participant
	var isBlocked bool
	err = a.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM blocked_users bu
			JOIN conversation_participants cp ON bu.blocker_id = cp.user_id
			WHERE cp.conversation_id = $1
			  AND bu.blocked_id = $2
		)
	`, conversationID, userID).Scan(&isBlocked)

	if err != nil {
		return false, fmt.Errorf("failed to check blocked status: %w", err)
	}

	if isBlocked {
		log.Printf("[SECURITY] Blocked user message attempt: user_id=%d, conversation_id=%d", userID, conversationID)
		return false, nil
	}

	return true, nil
}

// CanSendToUser checks if user can send a direct message to another user
func (a *Authorizer) CanSendToUser(ctx context.Context, senderID, recipientID int) (bool, error) {
	// Check if sender is blocked by recipient
	var isBlocked bool
	err := a.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM blocked_users
			WHERE blocker_id = $1 AND blocked_id = $2
		)
	`, recipientID, senderID).Scan(&isBlocked)

	if err != nil {
		return false, fmt.Errorf("failed to check blocked status: %w", err)
	}

	if isBlocked {
		log.Printf("[SECURITY] Blocked user DM attempt: sender=%d, recipient=%d", senderID, recipientID)
		return false, nil
	}

	return true, nil
}

// IsAdmin checks if user has admin permissions
func (a *Authorizer) IsAdmin(ctx context.Context, userID int) (bool, error) {
	var role string
	err := a.db.QueryRow(ctx, `
		SELECT role FROM users WHERE id = $1
	`, userID).Scan(&role)

	if err != nil {
		return false, fmt.Errorf("failed to check admin status: %w", err)
	}

	return role == "admin", nil
}
