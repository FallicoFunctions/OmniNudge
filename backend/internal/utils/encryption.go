package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

var (
	// ErrInvalidCiphertext is returned when the ciphertext is invalid
	ErrInvalidCiphertext = errors.New("invalid ciphertext")
	// ErrEncryptionKeyNotSet is returned when the encryption key is not set
	ErrEncryptionKeyNotSet = errors.New("encryption key not set")
)

// encryptionKey holds the AES encryption key for email encryption
var encryptionKey []byte

// SetEncryptionKey sets the encryption key from the environment
// The key should be 32 bytes (256 bits) for AES-256
func SetEncryptionKey(key string) error {
	if len(key) == 0 {
		return ErrEncryptionKeyNotSet
	}

	// If the key is base64 encoded, decode it
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err == nil && len(decoded) == 32 {
		encryptionKey = decoded
		return nil
	}

	// Otherwise use the key directly (pad or truncate to 32 bytes)
	keyBytes := []byte(key)
	if len(keyBytes) < 32 {
		// Pad with zeros if too short
		padded := make([]byte, 32)
		copy(padded, keyBytes)
		encryptionKey = padded
	} else if len(keyBytes) > 32 {
		// Truncate if too long
		encryptionKey = keyBytes[:32]
	} else {
		encryptionKey = keyBytes
	}

	return nil
}

// EncryptEmail encrypts an email address using AES-256-GCM
// Returns base64-encoded ciphertext
func EncryptEmail(plaintext string) (string, error) {
	if len(encryptionKey) == 0 {
		return "", ErrEncryptionKeyNotSet
	}

	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptEmail decrypts an email address using AES-256-GCM
// Takes base64-encoded ciphertext and returns plaintext
func DecryptEmail(ciphertext string) (string, error) {
	if len(encryptionKey) == 0 {
		return "", ErrEncryptionKeyNotSet
	}

	if ciphertext == "" {
		return "", nil
	}

	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", ErrInvalidCiphertext
	}

	nonce, ciphertextBytes := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
