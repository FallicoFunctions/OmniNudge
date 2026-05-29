package websocket

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	zlog "github.com/rs/zerolog/log"
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
	participantIDs, err := a.ListConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		return false, err
	}

	exists := false
	for _, participantID := range participantIDs {
		if participantID == userID {
			exists = true
			break
		}
	}

	if !exists {
		zlog.Warn().
			Int("user_id", userID).
			Int("conversation_id", conversationID).
			Str("event_type", "unauthorized_conversation_access").
			Msg("websocket: unauthorized conversation access attempt")
	}

	return exists, nil
}

// ListConversationParticipantIDs returns user IDs for all participants in a conversation.
func (a *Authorizer) ListConversationParticipantIDs(ctx context.Context, conversationID int) ([]int, error) {
	var conversationType string
	var user1ID *int
	var user2ID *int
	err := a.db.QueryRow(ctx, `
		SELECT COALESCE(conversation_type, 'dm'), user1_id, user2_id
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType, &user1ID, &user2ID)
	if err != nil {
		return nil, fmt.Errorf("failed to load conversation participants: %w", err)
	}

	if conversationType == "dm" {
		ids := make([]int, 0, 2)
		if user1ID != nil {
			ids = append(ids, *user1ID)
		}
		if user2ID != nil && (user1ID == nil || *user2ID != *user1ID) {
			ids = append(ids, *user2ID)
		}
		return ids, nil
	}

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

	participantIDs, err := a.ListConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		return false, err
	}

	// Check if user is blocked by any participant
	var isBlocked bool
	err = a.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM blocked_users
			WHERE blocker_id = ANY($1)
			  AND blocked_id = $2
		)
	`, participantIDs, userID).Scan(&isBlocked)

	if err != nil {
		return false, fmt.Errorf("failed to check blocked status: %w", err)
	}

	if isBlocked {
		zlog.Warn().
			Int("user_id", userID).
			Int("conversation_id", conversationID).
			Str("event_type", "blocked_user_message_attempt").
			Msg("websocket: blocked user attempted to send message")
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
		zlog.Warn().
			Int("sender_id", senderID).
			Int("recipient_id", recipientID).
			Str("event_type", "blocked_user_dm_attempt").
			Msg("websocket: blocked user attempted direct message")
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
