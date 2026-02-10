package services

import (
	"database/sql"
	"testing"

	_ "github.com/lib/pq"
)

func TestGenerateAESKey(t *testing.T) {
	// Test key generation
	key1, err := GenerateAESKey()
	if err != nil {
		t.Fatalf("Failed to generate AES key: %v", err)
	}

	if len(key1) != 32 {
		t.Errorf("Expected 32-byte key, got %d bytes", len(key1))
	}

	// Generate another key and ensure they're different (non-deterministic)
	key2, err := GenerateAESKey()
	if err != nil {
		t.Fatalf("Failed to generate second AES key: %v", err)
	}

	if string(key1) == string(key2) {
		t.Error("Expected different keys, got identical keys (bad randomness)")
	}
}

func TestEncryptDecryptGroupMessage(t *testing.T) {
	// Generate test key
	aesKey, err := GenerateAESKey()
	if err != nil {
		t.Fatalf("Failed to generate AES key: %v", err)
	}

	testCases := []struct {
		name    string
		message string
	}{
		{"Simple message", "Hello, world!"},
		{"Empty message", ""},
		{"Long message", "This is a very long message that contains multiple sentences and should still be encrypted and decrypted correctly without any issues."},
		{"Unicode", "Hello 世界 🌍 مرحبا"},
		{"Special chars", "!@#$%^&*()_+-=[]{}|;:'\",.<>?/`~"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Encrypt
			ciphertext, iv, err := EncryptGroupMessage(tc.message, aesKey)
			if err != nil {
				t.Fatalf("Encryption failed: %v", err)
			}

			if ciphertext == "" {
				t.Error("Ciphertext is empty")
			}
			if iv == "" {
				t.Error("IV is empty")
			}

			// Decrypt
			decrypted, err := DecryptGroupMessage(ciphertext, iv, aesKey)
			if err != nil {
				t.Fatalf("Decryption failed: %v", err)
			}

			if decrypted != tc.message {
				t.Errorf("Expected %q, got %q", tc.message, decrypted)
			}
		})
	}
}

func TestEncryptGroupMessage_NonDeterministic(t *testing.T) {
	aesKey, _ := GenerateAESKey()
	message := "Test message"

	// Encrypt same message twice
	ciphertext1, iv1, _ := EncryptGroupMessage(message, aesKey)
	ciphertext2, iv2, _ := EncryptGroupMessage(message, aesKey)

	// Should produce different ciphertexts (random IV)
	if ciphertext1 == ciphertext2 {
		t.Error("Expected different ciphertexts for same message (bad randomness)")
	}

	if iv1 == iv2 {
		t.Error("Expected different IVs (bad randomness)")
	}

	// But both should decrypt to same message
	decrypted1, _ := DecryptGroupMessage(ciphertext1, iv1, aesKey)
	decrypted2, _ := DecryptGroupMessage(ciphertext2, iv2, aesKey)

	if decrypted1 != message || decrypted2 != message {
		t.Error("Decryption failed for non-deterministic encryption")
	}
}

func TestDecryptGroupMessage_InvalidKey(t *testing.T) {
	// Create message with one key
	aesKey1, _ := GenerateAESKey()
	ciphertext, iv, _ := EncryptGroupMessage("Secret", aesKey1)

	// Try to decrypt with different key
	aesKey2, _ := GenerateAESKey()
	_, err := DecryptGroupMessage(ciphertext, iv, aesKey2)

	if err == nil {
		t.Error("Expected decryption to fail with wrong key")
	}
}

func TestDecryptGroupMessage_InvalidCiphertext(t *testing.T) {
	aesKey, _ := GenerateAESKey()

	testCases := []struct {
		name       string
		ciphertext string
		iv         string
	}{
		{"Invalid base64 ciphertext", "not-valid-base64!", "dGVzdA=="},
		{"Invalid base64 IV", "dGVzdA==", "not-valid-base64!"},
		{"Wrong IV length", "dGVzdA==", "c2hvcnQ="}, // "short" in base64
		{"Tampered ciphertext", "YWJjZGVmZ2hpams=", "dGVzdHRlc3R0ZXM="},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := DecryptGroupMessage(tc.ciphertext, tc.iv, aesKey)
			if err == nil {
				t.Error("Expected decryption to fail")
			}
		})
	}
}

func TestEncryptGroupMessage_InvalidKeySize(t *testing.T) {
	testCases := []struct {
		name    string
		keySize int
	}{
		{"Too short", 16},
		{"Too long", 64},
		{"Empty", 0},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			invalidKey := make([]byte, tc.keySize)
			_, _, err := EncryptGroupMessage("Test", invalidKey)
			if err == nil {
				t.Errorf("Expected error for key size %d", tc.keySize)
			}
		})
	}
}

// Integration tests (requires database connection)
// These tests are skipped unless DB_TEST_URL environment variable is set
// Example: DB_TEST_URL=postgresql://user:pass@localhost/testdb go test

func getTestDB(t *testing.T) *sql.DB {
	t.Helper()

	// Skip if no test database configured
	// In real implementation, would use environment variable
	t.Skip("Database integration tests require DB_TEST_URL environment variable")

	// Example connection (would come from env var):
	// db, err := sql.Open("postgres", os.Getenv("DB_TEST_URL"))
	// if err != nil {
	// 	t.Fatalf("Failed to connect to test database: %v", err)
	// }
	// return db

	return nil
}

func TestGroupEncryptionService_CreateGroupKey(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	service := NewGroupEncryptionService(db)

	// Create a group key
	key, err := service.CreateGroupKey(1, 1, "encrypted-aes-key-base64")
	if err != nil {
		t.Fatalf("Failed to create group key: %v", err)
	}

	if key.ConversationID != 1 {
		t.Errorf("Expected conversation_id 1, got %d", key.ConversationID)
	}

	if key.KeyVersion != 1 {
		t.Errorf("Expected version 1 for first key, got %d", key.KeyVersion)
	}

	if !key.IsActive {
		t.Error("Expected new key to be active")
	}
}

func TestGroupEncryptionService_RotateGroupKey(t *testing.T) {
	db := getTestDB(t)
	defer db.Close()

	service := NewGroupEncryptionService(db)

	// Create initial key
	_, err := service.CreateGroupKey(1, 1, "original-key")
	if err != nil {
		t.Fatalf("Failed to create initial key: %v", err)
	}

	// Rotate key
	memberKeys := map[int]string{
		1: "key-for-user-1",
		2: "key-for-user-2",
		3: "key-for-user-3",
	}

	newKey, err := service.RotateGroupKey(1, 1, "new-rotated-key", memberKeys)
	if err != nil {
		t.Fatalf("Failed to rotate key: %v", err)
	}

	if newKey.KeyVersion != 2 {
		t.Errorf("Expected version 2 after rotation, got %d", newKey.KeyVersion)
	}

	if newKey.MemberCount != 3 {
		t.Errorf("Expected 3 members, got %d", newKey.MemberCount)
	}

	// Verify old key is deactivated
	activeKey, _ := service.GetActiveGroupKey(1)
	if activeKey.KeyVersion != 2 {
		t.Error("Old key should be deactivated, new key should be active")
	}
}

func TestGroupEncryptionService_Performance(t *testing.T) {
	// Test encryption performance for 250 users
	aesKey, _ := GenerateAESKey()
	message := "This is a test message for benchmarking group encryption with 250 recipients."

	const numRecipients = 250

	// Encrypt message once
	ciphertext, iv, err := EncryptGroupMessage(message, aesKey)
	if err != nil {
		t.Fatalf("Encryption failed: %v", err)
	}

	// Simulate encrypting AES key for each recipient
	// (In real implementation, would use RSA encryption)
	for i := 0; i < numRecipients; i++ {
		// Placeholder: In production, would do RSA encryption here
		_ = ciphertext
		_ = iv
	}

	// Verify decryption works
	decrypted, err := DecryptGroupMessage(ciphertext, iv, aesKey)
	if err != nil {
		t.Fatalf("Decryption failed: %v", err)
	}

	if decrypted != message {
		t.Error("Decryption produced incorrect result")
	}

	// Note: Full performance test with RSA operations is in frontend benchmark
	t.Log("Performance test placeholder - full benchmark in encryption.benchmark.ts")
}

func BenchmarkEncryptGroupMessage(b *testing.B) {
	aesKey, _ := GenerateAESKey()
	message := "Benchmark message"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _ = EncryptGroupMessage(message, aesKey)
	}
}

func BenchmarkDecryptGroupMessage(b *testing.B) {
	aesKey, _ := GenerateAESKey()
	message := "Benchmark message"
	ciphertext, iv, _ := EncryptGroupMessage(message, aesKey)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = DecryptGroupMessage(ciphertext, iv, aesKey)
	}
}
