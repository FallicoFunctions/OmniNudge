# Email Encryption Implementation Summary

## Overview

Email addresses are now encrypted at rest in the OmniNudge database using AES-256-GCM encryption. Usernames remain in plaintext to allow efficient lookups and authentication.

## What Was Implemented

### 1. Encryption Utility Package
- **File**: `backend/internal/utils/encryption.go`
- **Features**:
  - AES-256-GCM encryption/decryption functions
  - Automatic nonce generation for each encryption
  - Base64 encoding for database storage
  - Support for both base64-encoded and raw encryption keys
  - Comprehensive error handling

### 2. Database Migration
- **Files**:
  - `backend/internal/database/migrations/039_encrypt_emails.up.sql`
  - `backend/internal/database/migrations/039_encrypt_emails.down.sql`
- **Changes**:
  - Increased email column size from 255 to 512 characters (to accommodate encrypted data)
  - Added `email_encrypted` boolean flag for tracking encryption status
  - Added index on `email_encrypted` for efficient migration queries

### 3. User Model Updates
- **File**: `backend/internal/models/user.go`
- **Changes**:
  - Added `EmailEncrypted` field to track encryption status
  - Added `EncryptedEmail` field to store encrypted data
  - Updated `Create()` method to encrypt emails before insertion
  - Updated all read methods (`GetByID`, `GetByUsername`, `GetByRedditID`) to decrypt emails automatically
  - Added backward compatibility for legacy plaintext emails

### 4. Configuration
- **File**: `backend/internal/config/config.go`
- **Changes**:
  - Added `EncryptionConfig` struct
  - Added `ENCRYPTION_KEY` environment variable support
  - Default dev key: "dev-encryption-key-change-me!!" (must be changed in production)

### 5. Main Application Initialization
- **File**: `backend/cmd/server/main.go`
- **Changes**:
  - Initialize encryption key on startup
  - Fail fast if encryption key is invalid

### 6. Data Migration Script
- **File**: `backend/scripts/encrypt_existing_emails.go`
- **Purpose**: Encrypt existing plaintext emails in the database
- **Features**:
  - Finds all users with plaintext emails
  - Encrypts each email individually
  - Shows progress during migration
  - Requires user confirmation before proceeding
  - Detailed success/failure reporting

### 7. Documentation
- **File**: `backend/docs/EMAIL_ENCRYPTION.md`
- **Contents**:
  - Setup instructions
  - Key generation guide
  - How encryption works
  - Key rotation procedures
  - Troubleshooting guide
  - Security best practices

### 8. Tests
- **File**: `backend/internal/utils/encryption_test.go`
- **Coverage**:
  - Encrypt/decrypt round-trip tests
  - Empty string handling
  - Invalid ciphertext handling
  - Missing encryption key error handling
  - Key format validation
  - Non-deterministic encryption verification

## How It Works

### New User Registration
1. User provides email during registration
2. Email is encrypted using AES-256-GCM
3. Encrypted email (base64-encoded) is stored in database
4. `email_encrypted` flag is set to TRUE

### User Login/Data Retrieval
1. User data is queried from database
2. System checks `email_encrypted` flag
3. If TRUE, email is decrypted using the encryption key
4. Decrypted email is returned in User struct
5. If FALSE (legacy data), email is returned as-is

### Encryption Details
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits (32 bytes)
- **Authentication**: Built-in with GCM mode
- **Nonce**: Unique random 12-byte nonce for each encryption
- **Storage Format**: Base64-encoded ciphertext (includes nonce + encrypted data + auth tag)

## Security Features

✅ **Confidentiality**: Email addresses are encrypted at rest
✅ **Integrity**: GCM mode provides authentication (detects tampering)
✅ **Uniqueness**: Random nonce ensures different ciphertexts for same plaintext
✅ **Backward Compatible**: Handles both encrypted and legacy plaintext emails
✅ **Fail-Safe**: Server won't start without valid encryption key

## Deployment Steps

### For New Deployments
1. Generate encryption key: `openssl rand -base64 32`
2. Set environment variable: `ENCRYPTION_KEY=<your-key>`
3. Deploy application
4. Encryption happens automatically for new users

### For Existing Deployments (with existing users)
1. Generate encryption key: `openssl rand -base64 32`
2. Set environment variable: `ENCRYPTION_KEY=<your-key>`
3. Deploy application with migration
4. Run data migration script:
   ```bash
   cd backend
   go run scripts/encrypt_existing_emails.go
   ```
5. Verify all emails are encrypted
6. Back up encryption key securely

## Environment Variables

```bash
# Required - AES-256 encryption key (32 bytes, base64-encoded or raw)
ENCRYPTION_KEY=your-secure-key-here

# Example for development (DO NOT use in production)
ENCRYPTION_KEY=dev-encryption-key-change-me!!

# Production example (generated with: openssl rand -base64 32)
ENCRYPTION_KEY=YourBase64EncodedKeyHere1234567890ABCDEF==
```

## Testing

All encryption tests pass:
```bash
cd backend
go test ./internal/utils -v -run TestEncrypt
```

Results:
- ✅ Encrypt/decrypt round-trip
- ✅ Empty string handling
- ✅ Invalid ciphertext detection
- ✅ Missing key error handling
- ✅ Multiple key formats
- ✅ Non-deterministic encryption

## Files Created/Modified

### New Files
- `backend/internal/utils/encryption.go` - Encryption utilities
- `backend/internal/utils/encryption_test.go` - Encryption tests
- `backend/internal/database/migrations/039_encrypt_emails.up.sql` - DB migration
- `backend/internal/database/migrations/039_encrypt_emails.down.sql` - DB rollback
- `backend/scripts/encrypt_existing_emails.go` - Data migration script
- `backend/docs/EMAIL_ENCRYPTION.md` - Documentation

### Modified Files
- `backend/internal/models/user.go` - User model and repository
- `backend/internal/config/config.go` - Configuration
- `backend/cmd/server/main.go` - Application initialization

## Important Notes

⚠️ **Encryption Key Management**:
- Never commit encryption keys to version control
- Use different keys for dev/staging/production
- Store keys in secure secret management (AWS Secrets Manager, Vault, etc.)
- Back up keys in multiple secure locations
- If key is lost, encrypted emails cannot be recovered

⚠️ **Usernames Are NOT Encrypted**:
- Usernames remain in plaintext for efficient lookups
- Login by username requires plaintext comparison
- User profile URLs (e.g., `/users/:username`) require plaintext

⚠️ **Backward Compatibility**:
- System handles both encrypted and legacy plaintext emails
- Migration can be done gradually
- No downtime required for encryption rollout

## Next Steps (Optional Future Enhancements)

1. **Key Rotation Support**: Implement dual-key decryption for seamless key rotation
2. **Audit Logging**: Log email access/decryption events
3. **Field-Level Encryption**: Extend to other sensitive fields (phone numbers, etc.)
4. **Hardware Security Module**: Use HSM for key storage in production
5. **Zero-Knowledge Encryption**: Consider client-side encryption for maximum privacy

## Support

For questions or issues:
1. Check `backend/docs/EMAIL_ENCRYPTION.md` for detailed documentation
2. Review test cases in `backend/internal/utils/encryption_test.go`
3. Examine migration script: `backend/scripts/encrypt_existing_emails.go`
