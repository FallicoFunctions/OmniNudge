package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Message represents an encrypted message in a conversation
type Message struct {
	ID               int        `json:"id"`
	ConversationID   int        `json:"conversation_id"`
	SenderID         int        `json:"sender_id"`
	RecipientID      int        `json:"recipient_id"`
	EncryptedContent string     `json:"encrypted_content"` // Base64 encoded encrypted blob
	MessageType      string     `json:"message_type"`      // "text", "image", "video", "audio"
	SentAt           time.Time  `json:"sent_at"`
	DeliveredAt      *time.Time `json:"delivered_at,omitempty"`
	ReadAt           *time.Time `json:"read_at,omitempty"`
	DeletedForSender bool       `json:"deleted_for_sender"`
	DeletedForRecipient bool    `json:"deleted_for_recipient"`
	MediaURL         *string    `json:"media_url,omitempty"`
	MediaType        *string    `json:"media_type,omitempty"`
	MediaSize        *int       `json:"media_size,omitempty"`
	EncryptionVersion int       `json:"encryption_version"` // For future encryption updates
}

// MessageRepository handles database operations for messages
type MessageRepository struct {
	pool *pgxpool.Pool
}

// NewMessageRepository creates a new message repository
func NewMessageRepository(pool *pgxpool.Pool) *MessageRepository {
	return &MessageRepository{pool: pool}
}

// Create creates a new message
func (r *MessageRepository) Create(ctx context.Context, message *Message) error {
	query := `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, encrypted_content,
			message_type, media_url, media_type, media_size, encryption_version
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, sent_at
	`

	err := r.pool.QueryRow(
		ctx, query,
		message.ConversationID,
		message.SenderID,
		message.RecipientID,
		message.EncryptedContent,
		message.MessageType,
		message.MediaURL,
		message.MediaType,
		message.MediaSize,
		message.EncryptionVersion,
	).Scan(&message.ID, &message.SentAt)

	return err
}

// GetByID retrieves a message by its ID
func (r *MessageRepository) GetByID(ctx context.Context, id int) (*Message, error) {
	message := &Message{}

	query := `
		SELECT id, conversation_id, sender_id, recipient_id, encrypted_content,
		       message_type, sent_at, delivered_at, read_at,
		       deleted_for_sender, deleted_for_recipient,
		       media_url, media_type, media_size, encryption_version
		FROM messages
		WHERE id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&message.ID,
		&message.ConversationID,
		&message.SenderID,
		&message.RecipientID,
		&message.EncryptedContent,
		&message.MessageType,
		&message.SentAt,
		&message.DeliveredAt,
		&message.ReadAt,
		&message.DeletedForSender,
		&message.DeletedForRecipient,
		&message.MediaURL,
		&message.MediaType,
		&message.MediaSize,
		&message.EncryptionVersion,
	)

	if err != nil {
		return nil, err
	}

	return message, nil
}

// GetByConversationID retrieves messages for a conversation
// Filters based on who is requesting (sender or recipient)
func (r *MessageRepository) GetByConversationID(ctx context.Context, conversationID int, userID int, limit int, offset int) ([]*Message, error) {
	query := `
		SELECT id, conversation_id, sender_id, recipient_id, encrypted_content,
		       message_type, sent_at, delivered_at, read_at,
		       deleted_for_sender, deleted_for_recipient,
		       media_url, media_type, media_size, encryption_version
		FROM messages
		WHERE conversation_id = $1
		  AND (
		    (sender_id = $2 AND deleted_for_sender = false) OR
		    (recipient_id = $2 AND deleted_for_recipient = false)
		  )
		ORDER BY sent_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.pool.Query(ctx, query, conversationID, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		message := &Message{}
		err := rows.Scan(
			&message.ID,
			&message.ConversationID,
			&message.SenderID,
			&message.RecipientID,
			&message.EncryptedContent,
			&message.MessageType,
			&message.SentAt,
			&message.DeliveredAt,
			&message.ReadAt,
			&message.DeletedForSender,
			&message.DeletedForRecipient,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
		)
		if err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}

	return messages, rows.Err()
}

// MarkAsDelivered updates the delivered_at timestamp for a message
func (r *MessageRepository) MarkAsDelivered(ctx context.Context, messageID int) error {
	query := `
		UPDATE messages
		SET delivered_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND delivered_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, messageID)
	return err
}

// MarkAsRead updates the read_at timestamp for a message
func (r *MessageRepository) MarkAsRead(ctx context.Context, messageID int) error {
	query := `
		UPDATE messages
		SET read_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND read_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, messageID)
	return err
}

// MarkAllAsRead marks all messages in a conversation as read for the recipient
func (r *MessageRepository) MarkAllAsRead(ctx context.Context, conversationID int, recipientID int) error {
	query := `
		UPDATE messages
		SET read_at = CURRENT_TIMESTAMP
		WHERE conversation_id = $1
		  AND recipient_id = $2
		  AND read_at IS NULL
	`
	_, err := r.pool.Exec(ctx, query, conversationID, recipientID)
	return err
}

// SoftDeleteForUser marks a message as deleted for a specific user
func (r *MessageRepository) SoftDeleteForUser(ctx context.Context, messageID int, userID int) error {
	// Determine if user is sender or recipient
	var isSender bool
	err := r.pool.QueryRow(ctx, "SELECT sender_id = $1 FROM messages WHERE id = $2", userID, messageID).Scan(&isSender)
	if err != nil {
		return err
	}

	var query string
	if isSender {
		query = `UPDATE messages SET deleted_for_sender = true WHERE id = $1`
	} else {
		query = `UPDATE messages SET deleted_for_recipient = true WHERE id = $1`
	}

	_, err = r.pool.Exec(ctx, query, messageID)
	return err
}

// HardDelete permanently deletes a message if both users have soft deleted it
func (r *MessageRepository) HardDelete(ctx context.Context, messageID int) error {
	query := `
		DELETE FROM messages
		WHERE id = $1
		  AND deleted_for_sender = true
		  AND deleted_for_recipient = true
	`
	_, err := r.pool.Exec(ctx, query, messageID)
	return err
}

// GetUnreadCount gets the count of unread messages for a user in a conversation
func (r *MessageRepository) GetUnreadCount(ctx context.Context, conversationID int, userID int) (int, error) {
	var count int
	query := `
		SELECT COUNT(*)
		FROM messages
		WHERE conversation_id = $1
		  AND recipient_id = $2
		  AND read_at IS NULL
		  AND deleted_for_recipient = false
	`
	err := r.pool.QueryRow(ctx, query, conversationID, userID).Scan(&count)
	return count, err
}

// GetLatestMessage gets the most recent message in a conversation
func (r *MessageRepository) GetLatestMessage(ctx context.Context, conversationID int) (*Message, error) {
	message := &Message{}

	query := `
		SELECT id, conversation_id, sender_id, recipient_id, encrypted_content,
		       message_type, sent_at, delivered_at, read_at,
		       deleted_for_sender, deleted_for_recipient,
		       media_url, media_type, media_size, encryption_version
		FROM messages
		WHERE conversation_id = $1
		ORDER BY sent_at DESC
		LIMIT 1
	`

	err := r.pool.QueryRow(ctx, query, conversationID).Scan(
		&message.ID,
		&message.ConversationID,
		&message.SenderID,
		&message.RecipientID,
		&message.EncryptedContent,
		&message.MessageType,
		&message.SentAt,
		&message.DeliveredAt,
		&message.ReadAt,
		&message.DeletedForSender,
		&message.DeletedForRecipient,
		&message.MediaURL,
		&message.MediaType,
		&message.MediaSize,
		&message.EncryptionVersion,
	)

	if err != nil {
		return nil, err
	}

	return message, nil
}

// IsParticipant checks if a user is a participant in the message
func (m *Message) IsParticipant(userID int) bool {
	return m.SenderID == userID || m.RecipientID == userID
}

// IsVisibleToUser checks if a message is visible to a specific user
func (m *Message) IsVisibleToUser(userID int) bool {
	if m.SenderID == userID {
		return !m.DeletedForSender
	}
	if m.RecipientID == userID {
		return !m.DeletedForRecipient
	}
	return false
}
