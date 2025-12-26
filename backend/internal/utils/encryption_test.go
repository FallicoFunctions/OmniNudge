package utils

import (
	"testing"
)

func TestEncryptDecryptEmail(t *testing.T) {
	// Set up a test encryption key
	testKey := "test-encryption-key-32-bytes!"
	if err := SetEncryptionKey(testKey); err != nil {
		t.Fatalf("Failed to set encryption key: %v", err)
	}

	tests := []struct {
		name  string
		email string
	}{
		{"simple email", "user@example.com"},
		{"email with plus", "user+tag@example.com"},
		{"email with subdomain", "user@mail.example.com"},
		{"long email", "verylongemailaddress.with.many.dots@subdomain.example.com"},
		{"empty string", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Encrypt
			encrypted, err := EncryptEmail(tt.email)
			if err != nil {
				t.Fatalf("EncryptEmail failed: %v", err)
			}

			// Empty string should return empty
			if tt.email == "" {
				if encrypted != "" {
					t.Errorf("Expected empty encrypted string, got %q", encrypted)
				}
				return
			}

			// Encrypted should be different from plaintext
			if encrypted == tt.email {
				t.Errorf("Encrypted email should differ from plaintext")
			}

			// Decrypt
			decrypted, err := DecryptEmail(encrypted)
			if err != nil {
				t.Fatalf("DecryptEmail failed: %v", err)
			}

			// Should match original
			if decrypted != tt.email {
				t.Errorf("Decrypted email = %q, want %q", decrypted, tt.email)
			}
		})
	}
}

func TestEncryptEmailWithoutKey(t *testing.T) {
	// Reset encryption key to empty
	encryptionKey = nil

	_, err := EncryptEmail("test@example.com")
	if err != ErrEncryptionKeyNotSet {
		t.Errorf("Expected ErrEncryptionKeyNotSet, got %v", err)
	}
}

func TestDecryptEmailWithoutKey(t *testing.T) {
	// Reset encryption key to empty
	encryptionKey = nil

	_, err := DecryptEmail("some-encrypted-data")
	if err != ErrEncryptionKeyNotSet {
		t.Errorf("Expected ErrEncryptionKeyNotSet, got %v", err)
	}
}

func TestDecryptInvalidCiphertext(t *testing.T) {
	testKey := "test-encryption-key-32-bytes!"
	if err := SetEncryptionKey(testKey); err != nil {
		t.Fatalf("Failed to set encryption key: %v", err)
	}

	tests := []struct {
		name       string
		ciphertext string
	}{
		{"invalid base64", "not-valid-base64!!!"},
		{"too short", "YWJj"}, // "abc" in base64
		{"wrong data", "SGVsbG8gV29ybGQh"}, // "Hello World!" in base64
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := DecryptEmail(tt.ciphertext)
			if err == nil {
				t.Errorf("Expected error decrypting invalid ciphertext, got nil")
			}
		})
	}
}

func TestSetEncryptionKeyFormats(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{"32 byte string", "12345678901234567890123456789012", false},
		{"base64 encoded", "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=", false},
		{"shorter string padded", "shortkey", false},
		{"longer string truncated", "this-is-a-very-long-key-that-exceeds-32-bytes-by-a-lot", false},
		{"empty string", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := SetEncryptionKey(tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("SetEncryptionKey() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err == nil && len(encryptionKey) != 32 {
				t.Errorf("Encryption key length = %d, want 32", len(encryptionKey))
			}
		})
	}
}

func TestEncryptionIsNonDeterministic(t *testing.T) {
	testKey := "test-encryption-key-32-bytes!"
	if err := SetEncryptionKey(testKey); err != nil {
		t.Fatalf("Failed to set encryption key: %v", err)
	}

	email := "test@example.com"

	// Encrypt the same email twice
	encrypted1, err := EncryptEmail(email)
	if err != nil {
		t.Fatalf("First encryption failed: %v", err)
	}

	encrypted2, err := EncryptEmail(email)
	if err != nil {
		t.Fatalf("Second encryption failed: %v", err)
	}

	// They should be different (due to random nonce)
	if encrypted1 == encrypted2 {
		t.Errorf("Two encryptions of the same email should produce different ciphertexts (due to random nonce)")
	}

	// But both should decrypt to the same value
	decrypted1, err := DecryptEmail(encrypted1)
	if err != nil {
		t.Fatalf("First decryption failed: %v", err)
	}

	decrypted2, err := DecryptEmail(encrypted2)
	if err != nil {
		t.Fatalf("Second decryption failed: %v", err)
	}

	if decrypted1 != email || decrypted2 != email {
		t.Errorf("Decrypted emails should match original. Got %q and %q, want %q", decrypted1, decrypted2, email)
	}
}
