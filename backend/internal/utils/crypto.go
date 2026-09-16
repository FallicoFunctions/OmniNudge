package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"

	"golang.org/x/crypto/pbkdf2"
)

// RSA and E2E related utilities

// DecryptRSA decrypts data using an RSA private key (OAEP)
func DecryptRSA(ciphertextBase64 string, privKeyPEM string) (string, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		return "", fmt.Errorf("decoding base64 failed: %w", err)
	}

	block, _ := pem.Decode([]byte(privKeyPEM))
	if block == nil {
		return "", errors.New("failed to parse PEM block containing private key")
	}

	priv, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		// Try PKCS8 if PKCS1 fails
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return "", fmt.Errorf("failed to parse private key: %w", err)
		}
		var ok bool
		priv, ok = key.(*rsa.PrivateKey)
		if !ok {
			return "", errors.New("not an RSA private key")
		}
	}

	label := []byte("")
	hash := sha256.New()
	plaintext, err := rsa.DecryptOAEP(hash, rand.Reader, priv, ciphertext, label)
	if err != nil {
		return "", fmt.Errorf("RSA decryption failed: %w", err)
	}

	return string(plaintext), nil
}

// DeriveKeyFromPassword derives a 32-byte key from a password and salt using PBKDF2-SHA256
func DeriveKeyFromPassword(password string, salt []byte) []byte {
	return pbkdf2.Key([]byte(password), salt, 100000, 32, sha256.New)
}

// DecryptWithPassword decrypts data using a password (derives key via PBKDF2)
// Used for decrypting the EncryptedPrivateKey
func DecryptWithPassword(ciphertextBase64 string, password string, saltBase64 string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(ciphertextBase64)
	if err != nil {
		return "", err
	}
	salt, err := base64.StdEncoding.DecodeString(saltBase64)
	if err != nil {
		return "", err
	}

	key := DeriveKeyFromPassword(password, salt)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, actualCiphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, actualCiphertext, nil)
	if err != nil {
		return "", fmt.Errorf("AES-GCM decryption failed (wrong password?): %w", err)
	}

	return string(plaintext), nil
}
