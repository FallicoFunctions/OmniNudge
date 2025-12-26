# Email Encryption

OmniNudge encrypts user email addresses at rest using AES-256-GCM encryption to protect user privacy.

## Overview

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits (32 bytes)
- **Storage**: Encrypted emails are stored as base64-encoded ciphertext
- **Scope**: Only email addresses are encrypted; usernames remain in plaintext for efficient lookups

## Security Features

1. **Authenticated Encryption**: GCM provides both confidentiality and authenticity
2. **Unique Nonces**: Each encryption uses a unique random nonce
3. **Automatic Decryption**: Emails are automatically decrypted when read from the database
4. **Backward Compatibility**: System handles both encrypted and legacy plaintext emails

## Setup

### 1. Generate an Encryption Key

Generate a secure 32-byte (256-bit) encryption key:

```bash
# Generate a random 32-byte key and base64-encode it
openssl rand -base64 32
```

Example output:
```
YourBase64EncodedKeyHere1234567890ABCDEF==
```

### 2. Set Environment Variable

Add the encryption key to your environment:

```bash
export ENCRYPTION_KEY="YourBase64EncodedKeyHere1234567890ABCDEF=="
```

Or add it to your `.env` file:
```
ENCRYPTION_KEY=YourBase64EncodedKeyHere1234567890ABCDEF==
```

**IMPORTANT**:
- Keep this key secret and secure
- Never commit it to version control
- Use a different key for each environment (dev, staging, prod)
- If you lose this key, you cannot decrypt existing emails

### 3. Run Database Migration

Apply the database migration to add encryption support:

```bash
# The migration runs automatically if DB_AUTO_MIGRATE=true
# Or run manually with:
go run cmd/server/main.go
```

This will:
- Increase the email column size to accommodate encrypted data
- Add an `email_encrypted` flag column
- Create necessary indexes

### 4. Encrypt Existing Emails (if applicable)

If you have existing users with plaintext emails, run the migration script:

```bash
cd backend
go run scripts/encrypt_existing_emails.go
```

The script will:
1. Find all users with plaintext emails
2. Encrypt each email using the configured encryption key
3. Update the database with encrypted values
4. Mark emails as encrypted with the `email_encrypted` flag

## How It Works

### Registration/Creation
When a new user registers with an email:
1. Email is encrypted using AES-256-GCM
2. Encrypted ciphertext is stored in the `email` column
3. `email_encrypted` flag is set to `TRUE`

### Reading
When user data is retrieved:
1. System checks `email_encrypted` flag
2. If `TRUE`, email is decrypted using the encryption key
3. Decrypted email is returned in the User struct
4. If `FALSE`, email is returned as-is (legacy compatibility)

### Code Example

```go
// Creating a user (encryption is automatic)
user := &models.User{
    Username: "alice",
    Email:    &email, // "alice@example.com"
    PasswordHash: hashedPassword,
}
err := userRepo.Create(ctx, user)

// Reading a user (decryption is automatic)
user, err := userRepo.GetByID(ctx, userID)
fmt.Println(*user.Email) // "alice@example.com" (decrypted)
```

## Key Rotation

To rotate encryption keys:

1. **Dual-Key Period**:
   - Add new key as `ENCRYPTION_KEY_NEW`
   - Modify code to try new key first, fall back to old key
   - This allows reading old encrypted data

2. **Re-encrypt Data**:
   ```bash
   # Run with new key to re-encrypt all emails
   ENCRYPTION_KEY=$NEW_KEY go run scripts/encrypt_existing_emails.go
   ```

3. **Remove Old Key**: Once all data is re-encrypted, remove fallback code

## Troubleshooting

### "encryption key not set" error
- Ensure `ENCRYPTION_KEY` environment variable is set
- Check that the key is exactly 32 bytes when base64-decoded
- Verify the key is loaded before database operations

### "invalid ciphertext" error
- The encryption key may have changed
- Email data may be corrupted
- Check that you're using the correct key for the environment

### Performance Considerations
- Encryption/decryption adds minimal overhead (~microseconds per email)
- Database column size increased from 255 to 512 bytes
- No impact on username-based queries (usernames are not encrypted)

## Security Best Practices

1. **Key Management**:
   - Store encryption key in a secure secret management system (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Never log or expose the encryption key
   - Use different keys for different environments

2. **Access Control**:
   - Limit who can access the encryption key
   - Use IAM roles/policies to control key access
   - Rotate keys periodically (e.g., annually)

3. **Backup**:
   - Back up the encryption key securely
   - Store backups in multiple secure locations
   - Test key recovery procedures

4. **Monitoring**:
   - Monitor for decryption failures
   - Alert on suspicious access patterns
   - Log encryption/decryption operations (but not the data!)

## Migration Checklist

- [ ] Generate secure encryption key
- [ ] Set `ENCRYPTION_KEY` environment variable
- [ ] Run database migration
- [ ] Encrypt existing emails (if applicable)
- [ ] Test registration and login
- [ ] Verify encrypted emails in database
- [ ] Back up encryption key securely
- [ ] Document key location for team
- [ ] Set up key rotation schedule
