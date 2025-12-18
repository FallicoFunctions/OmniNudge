package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Message represents an encrypted message in a conversation
type Message struct {
	ID                       int        `json:"id"`
	ConversationID           int        `json:"conversation_id"`
	SenderID                 int        `json:"sender_id"`
	RecipientID              int        `json:"recipient_id"`
	EncryptedContent         string     `json:"encrypted_content"` // Base64 encoded encrypted blob (recipient copy or plaintext)
	SenderEncryptedContent   *string    `json:"sender_encrypted_content,omitempty"`
	MessageType              string     `json:"message_type"` // "text", "image", "video", "audio"
	SentAt                   time.Time  `json:"sent_at"`
	DeliveredAt              *time.Time `json:"delivered_at,omitempty"`
	ReadAt                   *time.Time `json:"read_at,omitempty"`
	DeletedForSender         bool       `json:"deleted_for_sender"`
	DeletedForRecipient      bool       `json:"deleted_for_recipient"`
	MediaFileID              *int       `json:"media_file_id,omitempty"` // References media_files table
	MediaURL                 *string    `json:"media_url,omitempty"`
	MediaType                *string    `json:"media_type,omitempty"`
	MediaSize                *int       `json:"media_size,omitempty"`
	EncryptionVersion        string     `json:"encryption_version"`             // For future encryption updates, e.g., "v1"
	MediaEncryptionKey       *string    `json:"media_encryption_key,omitempty"` // RSA-encrypted AES key (Base64) for recipient
	MediaEncryptionIV        *string    `json:"media_encryption_iv,omitempty"`  // AES-GCM initialization vector (Base64)
	SenderMediaEncryptionKey *string    `json:"sender_media_encryption_key,omitempty"`
}

// MessageRepository handles database operations for messages
type MessageRepository struct {
	pool *pgxpool.Pool
}

// NewMessageRepository creates a new message repository
func NewMessageRepository(pool *pgxpool.Pool) *MessageRepository {
	return &MessageRepository{pool: pool}
}

// DeliveredMessage represents a message that was marked delivered
type DeliveredMessage struct {
	ID       int
	SenderID int
}

// Create creates a new message
func (r *MessageRepository) Create(ctx context.Context, message *Message) error {
	query := `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, encrypted_content, sender_encrypted_content,
			message_type, media_file_id, media_url, media_type, media_size, encryption_version,
			media_encryption_key, media_encryption_iv, sender_media_encryption_key
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, sent_at
	`

	err := r.pool.QueryRow(
		ctx, query,
		message.ConversationID,
		message.SenderID,
		message.RecipientID,
		message.EncryptedContent,
		message.SenderEncryptedContent,
		message.MessageType,
		message.MediaFileID,
		message.MediaURL,
		message.MediaType,
		message.MediaSize,
		message.EncryptionVersion,
		message.MediaEncryptionKey,
		message.MediaEncryptionIV,
		message.SenderMediaEncryptionKey,
	).Scan(&message.ID, &message.SentAt)

	return err
}

// GetByID retrieves a message by its ID
func (r *MessageRepository) GetByID(ctx context.Context, id int) (*Message, error) {
	message := &Message{}

	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&message.ID,
		&message.ConversationID,
		&message.SenderID,
		&message.RecipientID,
		&message.EncryptedContent,
		&message.SenderEncryptedContent,
		&message.MessageType,
		&message.SentAt,
		&message.DeliveredAt,
		&message.ReadAt,
		&message.DeletedForSender,
		&message.DeletedForRecipient,
		&message.MediaFileID,
		&message.MediaURL,
		&message.MediaType,
		&message.MediaSize,
		&message.EncryptionVersion,
		&message.MediaEncryptionKey,
		&message.MediaEncryptionIV,
		&message.SenderMediaEncryptionKey,
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
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		  AND (
		    (m.sender_id = $2 AND m.deleted_for_sender = false) OR
		    (m.recipient_id = $2 AND m.deleted_for_recipient = false)
		  )
		ORDER BY m.sent_at DESC
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
			&message.SenderEncryptedContent,
			&message.MessageType,
			&message.SentAt,
			&message.DeliveredAt,
			&message.ReadAt,
			&message.DeletedForSender,
			&message.DeletedForRecipient,
			&message.MediaFileID,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
			&message.MediaEncryptionKey,
			&message.MediaEncryptionIV,
			&message.SenderMediaEncryptionKey,
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

// MarkUndeliveredAsDelivered marks all undelivered messages in a conversation for a recipient
// and returns the updated message IDs and their sender IDs.
func (r *MessageRepository) MarkUndeliveredAsDelivered(ctx context.Context, conversationID int, recipientID int) ([]DeliveredMessage, error) {
	query := `
		UPDATE messages
		SET delivered_at = CURRENT_TIMESTAMP
		WHERE conversation_id = $1
		  AND recipient_id = $2
		  AND delivered_at IS NULL
		RETURNING id, sender_id
	`

	rows, err := r.pool.Query(ctx, query, conversationID, recipientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var delivered []DeliveredMessage
	for rows.Next() {
		var dm DeliveredMessage
		if err := rows.Scan(&dm.ID, &dm.SenderID); err != nil {
			return nil, err
		}
		delivered = append(delivered, dm)
	}

	return delivered, rows.Err()
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
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		ORDER BY m.sent_at DESC
		LIMIT 1
	`

	err := r.pool.QueryRow(ctx, query, conversationID).Scan(
		&message.ID,
		&message.ConversationID,
		&message.SenderID,
		&message.RecipientID,
		&message.EncryptedContent,
		&message.SenderEncryptedContent,
		&message.MessageType,
		&message.SentAt,
		&message.DeliveredAt,
		&message.ReadAt,
		&message.DeletedForSender,
		&message.DeletedForRecipient,
		&message.MediaFileID,
		&message.MediaURL,
		&message.MediaType,
		&message.MediaSize,
		&message.EncryptionVersion,
		&message.MediaEncryptionKey,
		&message.MediaEncryptionIV,
		&message.SenderMediaEncryptionKey,
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
