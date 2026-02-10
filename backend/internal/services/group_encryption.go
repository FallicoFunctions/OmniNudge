package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"time"
)

// GroupEncryptionService handles group message encryption with key rotation
type GroupEncryptionService struct {
	db *sql.DB
}

// NewGroupEncryptionService creates a new group encryption service
func NewGroupEncryptionService(db *sql.DB) *GroupEncryptionService {
	return &GroupEncryptionService{db: db}
}

// GroupEncryptionKey represents a group encryption key
type GroupEncryptionKey struct {
	ID                 int       `json:"id"`
	ConversationID     int       `json:"conversation_id"`
	KeyVersion         int       `json:"key_version"`
	EncryptedGroupKey  string    `json:"encrypted_group_key"`
	CreatedBy          int       `json:"created_by"`
	CreatedAt          time.Time `json:"created_at"`
	ExpiresAt          *time.Time `json:"expires_at,omitempty"`
	IsActive           bool      `json:"is_active"`
	MemberCount        int       `json:"member_count"`
}

// GroupKeyMember represents a member's copy of a group encryption key
type GroupKeyMember struct {
	ID                   int       `json:"id"`
	GroupKeyID           int       `json:"group_key_id"`
	UserID               int       `json:"user_id"`
	EncryptedKeyForUser  string    `json:"encrypted_key_for_user"`
	DeliveredAt          *time.Time `json:"delivered_at,omitempty"`
	CreatedAt            time.Time `json:"created_at"`
}

// GenerateAESKey generates a new AES-256 key for group encryption
func GenerateAESKey() ([]byte, error) {
	key := make([]byte, 32) // AES-256 requires 32 bytes
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("failed to generate AES key: %w", err)
	}
	return key, nil
}

// CreateGroupKey creates a new group encryption key for a conversation
// The group key is encrypted with the creator's public key for backup
func (s *GroupEncryptionService) CreateGroupKey(
	conversationID int,
	creatorID int,
	encryptedGroupKey string, // AES key encrypted with creator's RSA public key
) (*GroupEncryptionKey, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// Deactivate previous keys for this conversation
	_, err = tx.Exec(`
		UPDATE group_encryption_keys
		SET is_active = FALSE
		WHERE conversation_id = $1 AND is_active = TRUE
	`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("failed to deactivate old keys: %w", err)
	}

	// Get next version number
	var maxVersion sql.NullInt64
	err = tx.QueryRow(`
		SELECT MAX(key_version)
		FROM group_encryption_keys
		WHERE conversation_id = $1
	`, conversationID).Scan(&maxVersion)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to get max version: %w", err)
	}

	newVersion := 1
	if maxVersion.Valid {
		newVersion = int(maxVersion.Int64) + 1
	}

	// Create new key
	var key GroupEncryptionKey
	err = tx.QueryRow(`
		INSERT INTO group_encryption_keys (
			conversation_id, key_version, encrypted_group_key,
			created_by, is_active, member_count
		) VALUES ($1, $2, $3, $4, TRUE, 0)
		RETURNING id, conversation_id, key_version, encrypted_group_key,
			created_by, created_at, expires_at, is_active, member_count
	`, conversationID, newVersion, encryptedGroupKey, creatorID).Scan(
		&key.ID, &key.ConversationID, &key.KeyVersion, &key.EncryptedGroupKey,
		&key.CreatedBy, &key.CreatedAt, &key.ExpiresAt, &key.IsActive, &key.MemberCount,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert group key: %w", err)
	}

	// Update conversation's current encryption version
	_, err = tx.Exec(`
		UPDATE conversations
		SET current_encryption_version = $1,
			encryption_enabled = TRUE,
			last_key_rotation_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, newVersion, conversationID)
	if err != nil {
		return nil, fmt.Errorf("failed to update conversation: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &key, nil
}

// AddMemberKey adds a member's encrypted copy of the group key
func (s *GroupEncryptionService) AddMemberKey(
	groupKeyID int,
	userID int,
	encryptedKeyForUser string, // Group AES key encrypted with user's RSA public key
) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// Insert member key
	_, err = tx.Exec(`
		INSERT INTO group_key_members (
			group_key_id, user_id, encrypted_key_for_user
		) VALUES ($1, $2, $3)
		ON CONFLICT (group_key_id, user_id)
		DO UPDATE SET encrypted_key_for_user = EXCLUDED.encrypted_key_for_user
	`, groupKeyID, userID, encryptedKeyForUser)
	if err != nil {
		return fmt.Errorf("failed to insert member key: %w", err)
	}

	// Increment member count
	_, err = tx.Exec(`
		UPDATE group_encryption_keys
		SET member_count = (
			SELECT COUNT(*) FROM group_key_members WHERE group_key_id = $1
		)
		WHERE id = $1
	`, groupKeyID)
	if err != nil {
		return fmt.Errorf("failed to update member count: %w", err)
	}

	return tx.Commit()
}

// GetActiveGroupKey retrieves the active encryption key for a conversation
func (s *GroupEncryptionService) GetActiveGroupKey(conversationID int) (*GroupEncryptionKey, error) {
	var key GroupEncryptionKey
	err := s.db.QueryRow(`
		SELECT id, conversation_id, key_version, encrypted_group_key,
			created_by, created_at, expires_at, is_active, member_count
		FROM group_encryption_keys
		WHERE conversation_id = $1 AND is_active = TRUE
		LIMIT 1
	`, conversationID).Scan(
		&key.ID, &key.ConversationID, &key.KeyVersion, &key.EncryptedGroupKey,
		&key.CreatedBy, &key.CreatedAt, &key.ExpiresAt, &key.IsActive, &key.MemberCount,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("no active group key found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get active group key: %w", err)
	}
	return &key, nil
}

// GetMemberKey retrieves a user's encrypted copy of a group key
func (s *GroupEncryptionService) GetMemberKey(groupKeyID int, userID int) (string, error) {
	var encryptedKey string
	err := s.db.QueryRow(`
		SELECT encrypted_key_for_user
		FROM group_key_members
		WHERE group_key_id = $1 AND user_id = $2
	`, groupKeyID, userID).Scan(&encryptedKey)
	if err == sql.ErrNoRows {
		return "", errors.New("member key not found")
	}
	if err != nil {
		return "", fmt.Errorf("failed to get member key: %w", err)
	}
	return encryptedKey, nil
}

// RotateGroupKey rotates the group encryption key (called on member add/remove)
// memberKeys maps userID to the new group key encrypted with that user's public key
func (s *GroupEncryptionService) RotateGroupKey(
	conversationID int,
	rotatedBy int,
	encryptedGroupKey string,
	memberKeys map[int]string, // userID -> encrypted key for that user
) (*GroupEncryptionKey, error) {
	// Create new key
	newKey, err := s.CreateGroupKey(conversationID, rotatedBy, encryptedGroupKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create new group key: %w", err)
	}

	// Add all member keys
	for userID, encryptedKey := range memberKeys {
		if err := s.AddMemberKey(newKey.ID, userID, encryptedKey); err != nil {
			return nil, fmt.Errorf("failed to add member key for user %d: %w", userID, err)
		}
	}

	return newKey, nil
}

// EncryptGroupMessage encrypts a message with AES-256-GCM
// Returns base64-encoded ciphertext and IV
func EncryptGroupMessage(message string, aesKey []byte) (ciphertext string, iv string, err error) {
	if len(aesKey) != 32 {
		return "", "", errors.New("AES key must be 32 bytes for AES-256")
	}

	// Create AES cipher
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate random nonce (12 bytes for GCM)
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt
	messageBytes := []byte(message)
	ciphertextBytes := gcm.Seal(nil, nonce, messageBytes, nil)

	// Encode to base64
	ciphertext = base64.StdEncoding.EncodeToString(ciphertextBytes)
	iv = base64.StdEncoding.EncodeToString(nonce)

	return ciphertext, iv, nil
}

// DecryptGroupMessage decrypts an AES-256-GCM encrypted message
func DecryptGroupMessage(ciphertext string, iv string, aesKey []byte) (string, error) {
	if len(aesKey) != 32 {
		return "", errors.New("AES key must be 32 bytes for AES-256")
	}

	// Decode from base64
	ciphertextBytes, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(iv)
	if err != nil {
		return "", fmt.Errorf("failed to decode IV: %w", err)
	}

	// Create AES cipher
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Validate nonce size
	if len(nonce) != gcm.NonceSize() {
		return "", fmt.Errorf("invalid IV length: got %d bytes, expected %d bytes", len(nonce), gcm.NonceSize())
	}

	// Decrypt
	plaintextBytes, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintextBytes), nil
}

// ListGroupKeys lists all encryption keys for a conversation (for debugging/auditing)
func (s *GroupEncryptionService) ListGroupKeys(conversationID int) ([]GroupEncryptionKey, error) {
	rows, err := s.db.Query(`
		SELECT id, conversation_id, key_version, encrypted_group_key,
			created_by, created_at, expires_at, is_active, member_count
		FROM group_encryption_keys
		WHERE conversation_id = $1
		ORDER BY key_version DESC
	`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("failed to list group keys: %w", err)
	}
	defer rows.Close()

	var keys []GroupEncryptionKey
	for rows.Next() {
		var key GroupEncryptionKey
		err := rows.Scan(
			&key.ID, &key.ConversationID, &key.KeyVersion, &key.EncryptedGroupKey,
			&key.CreatedBy, &key.CreatedAt, &key.ExpiresAt, &key.IsActive, &key.MemberCount,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}
		keys = append(keys, key)
	}

	return keys, rows.Err()
}
