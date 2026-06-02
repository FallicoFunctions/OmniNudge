package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrMessageAlreadyDeleted is returned by AutoDelete when the message no longer
// exists (already hard-deleted or tombstoned by a concurrent path). Callers
// should skip the WS broadcast for this message_id.
var ErrMessageAlreadyDeleted = errors.New("message already deleted")

// Message represents an encrypted message in a conversation
type Message struct {
	ID                       int            `json:"id"`
	ConversationID           int            `json:"conversation_id"`
	SenderID                 int            `json:"sender_id"`
	RecipientID              int            `json:"recipient_id"`
	EncryptedContent         string         `json:"encrypted_content"` // Base64 encoded encrypted blob (recipient copy or plaintext)
	SenderEncryptedContent   *string        `json:"sender_encrypted_content,omitempty"`
	MessageType              string         `json:"message_type"` // "text", "image", "video", "audio"
	SentAt                   time.Time      `json:"sent_at"`
	DeliveredAt              *time.Time     `json:"delivered_at,omitempty"`
	ReadAt                   *time.Time     `json:"read_at,omitempty"`
	Edited                   bool           `json:"edited"`
	EditedAt                 *time.Time     `json:"edited_at,omitempty"`
	Pinned                   bool           `json:"pinned"`
	PinnedBy                 *int           `json:"pinned_by,omitempty"`
	PinnedAt                 *time.Time     `json:"pinned_at,omitempty"`
	DeletedForSender         bool           `json:"deleted_for_sender"`
	DeletedForRecipient      bool           `json:"deleted_for_recipient"`
	ReplyTo                  *int           `json:"reply_to,omitempty"`
	ThreadRoot               *int           `json:"thread_root,omitempty"`
	ReplyCount               int            `json:"reply_count"`
	MediaFileID              *int           `json:"media_file_id,omitempty"` // References media_files table
	MediaURL                 *string        `json:"media_url,omitempty"`
	MediaType                *string        `json:"media_type,omitempty"`
	MediaSize                *int           `json:"media_size,omitempty"`
	EncryptionVersion        string         `json:"encryption_version"`             // For future encryption updates, e.g., "v1"
	MediaEncryptionKey       *string        `json:"media_encryption_key,omitempty"` // RSA-encrypted AES key (Base64) for recipient
	MediaEncryptionIV        *string        `json:"media_encryption_iv,omitempty"`  // AES-GCM initialization vector (Base64)
	SenderMediaEncryptionKey *string        `json:"sender_media_encryption_key,omitempty"`
	IsMultiRecipient         bool           `json:"is_multi_recipient"`             // True for multi-recipient messages (mod mail)
	SharedEncryptionIV       *string        `json:"shared_encryption_iv,omitempty"` // Shared IV for multi-recipient messages
	RecipientKeys            map[int]string `json:"recipient_keys,omitempty"`       // Map of user_id -> encrypted_key for multi-recipient
	HasReactions             bool           `json:"has_reactions"`                  // True when ≥1 reaction exists — avoids N+1 fetches on the client
	DeleteAt                 *time.Time     `json:"delete_at,omitempty"`            // Auto-delete timestamp; NULL means never
}

// ExpiredMessage is a lightweight projection used by the auto-delete cron sweep.
type ExpiredMessage struct {
	ID             int
	ConversationID int
	SenderID       int
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
	// Start a transaction for multi-recipient messages
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, encrypted_content, sender_encrypted_content,
			message_type, reply_to, thread_root, media_file_id, media_url, media_type, media_size, encryption_version,
			media_encryption_key, media_encryption_iv, sender_media_encryption_key,
			is_multi_recipient, shared_encryption_iv, delete_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		RETURNING id, sent_at
	`

	err = tx.QueryRow(
		ctx, query,
		message.ConversationID,
		message.SenderID,
		message.RecipientID,
		message.EncryptedContent,
		message.SenderEncryptedContent,
		message.MessageType,
		message.ReplyTo,
		message.ThreadRoot,
		message.MediaFileID,
		message.MediaURL,
		message.MediaType,
		message.MediaSize,
		message.EncryptionVersion,
		message.MediaEncryptionKey,
		message.MediaEncryptionIV,
		message.SenderMediaEncryptionKey,
		message.IsMultiRecipient,
		message.SharedEncryptionIV,
		message.DeleteAt,
	).Scan(&message.ID, &message.SentAt)

	if err != nil {
		return err
	}

	// If this is a multi-recipient message, insert recipient keys
	if message.IsMultiRecipient && len(message.RecipientKeys) > 0 {
		for userID, encryptedKey := range message.RecipientKeys {
			_, err = tx.Exec(ctx, `
				INSERT INTO message_recipient_keys (message_id, user_id, encrypted_key)
				VALUES ($1, $2, $3)
			`, message.ID, userID, encryptedKey)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

// loadRecipientKeys loads the recipient keys for a multi-recipient message
func (r *MessageRepository) loadRecipientKeys(ctx context.Context, message *Message) error {
	if !message.IsMultiRecipient {
		return nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT user_id, encrypted_key
		FROM message_recipient_keys
		WHERE message_id = $1
	`, message.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	message.RecipientKeys = make(map[int]string)
	for rows.Next() {
		var userID int
		var encryptedKey string
		if err := rows.Scan(&userID, &encryptedKey); err != nil {
			return err
		}
		message.RecipientKeys[userID] = encryptedKey
	}

	return rows.Err()
}

// GetByID retrieves a message by its ID
func (r *MessageRepository) GetByID(ctx context.Context, id int) (*Message, error) {
	message := &Message{}

	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       COALESCE(m.edited, FALSE) AS edited, m.edited_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.reply_to, m.thread_root, COALESCE(m.reply_count, 0) AS reply_count,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key,
		       COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv
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
		&message.Edited,
		&message.EditedAt,
		&message.DeletedForSender,
		&message.DeletedForRecipient,
		&message.ReplyTo,
		&message.ThreadRoot,
		&message.ReplyCount,
		&message.MediaFileID,
		&message.MediaURL,
		&message.MediaType,
		&message.MediaSize,
		&message.EncryptionVersion,
		&message.MediaEncryptionKey,
		&message.MediaEncryptionIV,
		&message.SenderMediaEncryptionKey,
		&message.IsMultiRecipient,
		&message.SharedEncryptionIV,
	)

	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	// Load recipient keys if this is a multi-recipient message
	if err := r.loadRecipientKeys(ctx, message); err != nil {
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
		       COALESCE(m.edited, FALSE) AS edited, m.edited_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.reply_to, m.thread_root, COALESCE(m.reply_count, 0) AS reply_count,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key,
		       COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv,
		       EXISTS (SELECT 1 FROM message_reactions mr WHERE mr.message_id = m.id) AS has_reactions
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		  AND (
		    (m.sender_id = $2 AND m.deleted_for_sender = false) OR
		    (m.recipient_id = $2 AND m.deleted_for_recipient = false)
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = m.sender_id
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
			&message.Edited,
			&message.EditedAt,
			&message.DeletedForSender,
			&message.DeletedForRecipient,
			&message.ReplyTo,
			&message.ThreadRoot,
			&message.ReplyCount,
			&message.MediaFileID,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
			&message.MediaEncryptionKey,
			&message.MediaEncryptionIV,
			&message.SenderMediaEncryptionKey,
			&message.IsMultiRecipient,
			&message.SharedEncryptionIV,
			&message.HasReactions,
		)
		if err != nil {
			return nil, err
		}

		// Load recipient keys if this is a multi-recipient message
		if err := r.loadRecipientKeys(ctx, message); err != nil {
			return nil, err
		}

		messages = append(messages, message)
	}

	return messages, rows.Err()
}

// GetByConversationIDWithCursor retrieves messages for a conversation using cursor pagination (desc).
func (r *MessageRepository) GetByConversationIDWithCursor(
	ctx context.Context,
	conversationID int,
	userID int,
	limit int,
	cursor *TimeCursor,
) ([]*Message, error) {
	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.reply_to, m.thread_root, COALESCE(m.reply_count, 0) AS reply_count,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key,
		       COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv,
		       EXISTS (SELECT 1 FROM message_reactions mr WHERE mr.message_id = m.id) AS has_reactions
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		  AND (
		    (m.sender_id = $2 AND m.deleted_for_sender = false) OR
		    (m.recipient_id = $2 AND m.deleted_for_recipient = false)
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = m.sender_id
		  )
	`
	args := []interface{}{conversationID, userID}
	paramIdx := 3
	if cursor != nil {
		query += fmt.Sprintf(" AND (m.sent_at, m.id) < ($%d, $%d)", paramIdx, paramIdx+1)
		args = append(args, cursor.Timestamp, cursor.ID)
		paramIdx += 2
	}
	query += fmt.Sprintf(" ORDER BY m.sent_at DESC, m.id DESC LIMIT $%d", paramIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
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
			&message.ReplyTo,
			&message.ThreadRoot,
			&message.ReplyCount,
			&message.MediaFileID,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
			&message.MediaEncryptionKey,
			&message.MediaEncryptionIV,
			&message.SenderMediaEncryptionKey,
			&message.IsMultiRecipient,
			&message.SharedEncryptionIV,
			&message.HasReactions,
		)
		if err != nil {
			return nil, err
		}

		if err := r.loadRecipientKeys(ctx, message); err != nil {
			return nil, err
		}

		messages = append(messages, message)
	}

	return messages, rows.Err()
}

// GetByConversationIDForAll retrieves messages for mod mail conversations (visible to all participants)
func (r *MessageRepository) GetByConversationIDForAll(ctx context.Context, conversationID int, viewerID int, limit int, offset int) ([]*Message, error) {
	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.reply_to, m.thread_root, COALESCE(m.reply_count, 0) AS reply_count,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key,
		       COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv,
		       EXISTS (SELECT 1 FROM message_reactions mr WHERE mr.message_id = m.id) AS has_reactions
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		  AND NOT (m.deleted_for_sender = TRUE AND m.deleted_for_recipient = TRUE)
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = m.sender_id
		  )
		ORDER BY m.sent_at ASC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.pool.Query(ctx, query, conversationID, viewerID, limit, offset)
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
			&message.ReplyTo,
			&message.ThreadRoot,
			&message.ReplyCount,
			&message.MediaFileID,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
			&message.MediaEncryptionKey,
			&message.MediaEncryptionIV,
			&message.SenderMediaEncryptionKey,
			&message.IsMultiRecipient,
			&message.SharedEncryptionIV,
			&message.HasReactions,
		)
		if err != nil {
			return nil, err
		}

		// Load recipient keys if this is a multi-recipient message
		if err := r.loadRecipientKeys(ctx, message); err != nil {
			return nil, err
		}

		messages = append(messages, message)
	}

	return messages, rows.Err()
}

// GetByConversationIDForAllWithCursor retrieves mod mail messages using cursor pagination (asc).
func (r *MessageRepository) GetByConversationIDForAllWithCursor(
	ctx context.Context,
	conversationID int,
	viewerID int,
	limit int,
	cursor *TimeCursor,
) ([]*Message, error) {
	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.reply_to, m.thread_root, COALESCE(m.reply_count, 0) AS reply_count,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key,
		       COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv,
		       EXISTS (SELECT 1 FROM message_reactions mr WHERE mr.message_id = m.id) AS has_reactions
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		  AND NOT (m.deleted_for_sender = TRUE AND m.deleted_for_recipient = TRUE)
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = m.sender_id
		  )
	`
	args := []interface{}{conversationID, viewerID}
	paramIdx := 3
	if cursor != nil {
		query += fmt.Sprintf(" AND (m.sent_at, m.id) > ($%d, $%d)", paramIdx, paramIdx+1)
		args = append(args, cursor.Timestamp, cursor.ID)
		paramIdx += 2
	}
	query += fmt.Sprintf(" ORDER BY m.sent_at ASC, m.id ASC LIMIT $%d", paramIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
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
			&message.ReplyTo,
			&message.ThreadRoot,
			&message.ReplyCount,
			&message.MediaFileID,
			&message.MediaURL,
			&message.MediaType,
			&message.MediaSize,
			&message.EncryptionVersion,
			&message.MediaEncryptionKey,
			&message.MediaEncryptionIV,
			&message.SenderMediaEncryptionKey,
			&message.IsMultiRecipient,
			&message.SharedEncryptionIV,
			&message.HasReactions,
		)
		if err != nil {
			return nil, err
		}

		if err := r.loadRecipientKeys(ctx, message); err != nil {
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
		  AND message_type != 'system'
		  AND delivered_at IS NULL
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = messages.sender_id
		  )
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

// MarkAsRead updates the read_at timestamp for a message.
// System messages are excluded — they are informational-only and should
// not generate read-receipt WS events.
func (r *MessageRepository) MarkAsRead(ctx context.Context, messageID int) error {
	query := `
		UPDATE messages
		SET read_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND read_at IS NULL AND message_type != 'system'
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
		  AND message_type != 'system'
		  AND read_at IS NULL
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = messages.sender_id
		  )
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

// SoftDeleteForBoth marks a message as deleted for both sender and recipient
func (r *MessageRepository) SoftDeleteForBoth(ctx context.Context, messageID int) error {
	query := `
		UPDATE messages
		SET deleted_for_sender = true,
		    deleted_for_recipient = true
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, messageID)
	return err
}

// HardDelete permanently deletes a message if both users have soft deleted it
func (r *MessageRepository) HardDelete(ctx context.Context, messageID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// If the message is a thread root/ancestor, preserve its ID as a tombstone so replies remain navigable.
	_, err = tx.Exec(ctx, `
		UPDATE messages
		SET encrypted_content = '[deleted]',
		    sender_encrypted_content = NULL,
		    message_type = 'text',
		    media_file_id = NULL,
		    media_url = NULL,
		    media_type = NULL,
		    media_size = NULL,
		    media_encryption_key = NULL,
		    media_encryption_iv = NULL,
		    sender_media_encryption_key = NULL,
		    is_multi_recipient = FALSE,
		    shared_encryption_iv = NULL,
		    deleted_for_sender = TRUE,
		    deleted_for_recipient = TRUE
		WHERE id = $1
		  AND deleted_for_sender = TRUE
		  AND deleted_for_recipient = TRUE
		  AND EXISTS (
		    SELECT 1
		    FROM messages child
		    WHERE child.reply_to = $1 OR child.thread_root = $1
		  )
	`, messageID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		DELETE FROM messages
		WHERE id = $1
		  AND deleted_for_sender = TRUE
		  AND deleted_for_recipient = TRUE
		  AND NOT EXISTS (
		    SELECT 1
		    FROM messages child
		    WHERE child.reply_to = $1 OR child.thread_root = $1
		  )
	`, messageID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetUnreadCount gets the count of unread messages for a user in a conversation
func (r *MessageRepository) GetUnreadCount(ctx context.Context, conversationID int, userID int) (int, error) {
	var count int
	query := `
		SELECT COUNT(*)
		FROM messages
		WHERE conversation_id = $1
		  AND recipient_id = $2
		  AND message_type != 'system'
		  AND read_at IS NULL
		  AND deleted_for_recipient = false
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = messages.sender_id
		  )
	`
	err := r.pool.QueryRow(ctx, query, conversationID, userID).Scan(&count)
	return count, err
}

// GetLatestMessage gets the most recent message in a conversation
func (r *MessageRepository) GetLatestMessage(ctx context.Context, conversationID int, viewerID int) (*Message, error) {
	message := &Message{}

	query := `
		SELECT m.id, m.conversation_id, m.sender_id, m.recipient_id, m.encrypted_content,
		       m.sender_encrypted_content,
		       m.message_type, m.sent_at, m.delivered_at, m.read_at,
		       m.deleted_for_sender, m.deleted_for_recipient,
		       m.reply_to, m.thread_root, COALESCE(m.reply_count, 0) AS reply_count,
		       m.media_file_id,
		       COALESCE(mf.storage_url, m.media_url) as media_url,
		       COALESCE(m.media_type, mf.file_type) as media_type,
		       COALESCE(m.media_size, mf.file_size) as media_size,
		       m.encryption_version,
		       m.media_encryption_key,
		       m.media_encryption_iv,
		       m.sender_media_encryption_key,
		       COALESCE(m.is_multi_recipient, FALSE) as is_multi_recipient,
		       m.shared_encryption_iv
		FROM messages m
		LEFT JOIN media_files mf ON m.media_file_id = mf.id
		WHERE m.conversation_id = $1
		  AND NOT EXISTS (
		    SELECT 1 FROM blocked_users bu
		    WHERE bu.blocker_id = $2
		      AND bu.blocked_id = m.sender_id
		  )
		ORDER BY m.sent_at DESC
		LIMIT 1
	`

	err := r.pool.QueryRow(ctx, query, conversationID, viewerID).Scan(
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
		&message.ReplyTo,
		&message.ThreadRoot,
		&message.ReplyCount,
		&message.MediaFileID,
		&message.MediaURL,
		&message.MediaType,
		&message.MediaSize,
		&message.EncryptionVersion,
		&message.MediaEncryptionKey,
		&message.MediaEncryptionIV,
		&message.SenderMediaEncryptionKey,
		&message.IsMultiRecipient,
		&message.SharedEncryptionIV,
	)

	if err != nil {
		return nil, err
	}

	// Load recipient keys if this is a multi-recipient message
	if err := r.loadRecipientKeys(ctx, message); err != nil {
		return nil, err
	}

	return message, nil
}

// GetExpiredBefore returns up to limit messages whose delete_at is at or before t.
// Used by the auto-delete cron sweep.
func (r *MessageRepository) GetExpiredBefore(ctx context.Context, t time.Time, limit int) ([]ExpiredMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, conversation_id, sender_id
		FROM messages
		WHERE delete_at <= $1
		ORDER BY delete_at
		LIMIT $2
	`, t, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expired []ExpiredMessage
	for rows.Next() {
		var m ExpiredMessage
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID); err != nil {
			return nil, err
		}
		expired = append(expired, m)
	}
	return expired, rows.Err()
}

// AutoDelete permanently removes a message that has reached its auto-delete deadline.
// Unlike HardDelete, this path does not require deleted_for_sender/recipient flags.
// If the message has replies it is tombstoned instead of physically removed.
func (r *MessageRepository) AutoDelete(ctx context.Context, messageID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Use the stored reply_count so that a child that was already auto-deleted
	// doesn't cause the parent to be hard-deleted when it shouldn't be.
	tag, err := tx.Exec(ctx, `
		UPDATE messages
		SET encrypted_content = '[deleted]',
		    sender_encrypted_content = NULL,
		    message_type = 'deleted',
		    media_file_id = NULL,
		    media_url = NULL,
		    media_type = NULL,
		    media_size = NULL,
		    media_encryption_key = NULL,
		    media_encryption_iv = NULL,
		    sender_media_encryption_key = NULL,
		    is_multi_recipient = FALSE,
		    shared_encryption_iv = NULL,
		    deleted_for_sender = TRUE,
		    deleted_for_recipient = TRUE,
		    delete_at = NULL
		WHERE id = $1
		  AND COALESCE(reply_count, 0) > 0
	`, messageID)
	if err != nil {
		return err
	}
	tombstoned := tag.RowsAffected() > 0

	tag, err = tx.Exec(ctx, `
		DELETE FROM messages
		WHERE id = $1
		  AND COALESCE(reply_count, 0) = 0
	`, messageID)
	if err != nil {
		return err
	}

	if !tombstoned && tag.RowsAffected() == 0 {
		// Message was already deleted by another path; the deferred Rollback will
		// clean up the transaction. Callers should skip the WS broadcast.
		return ErrMessageAlreadyDeleted
	}

	return tx.Commit(ctx)
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
