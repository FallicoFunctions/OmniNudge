# Email Encryption Quick Start Guide

## For Development

### 1. The encryption key is already set to a default dev value
The default development key is configured in `backend/internal/config/config.go`:
```go
Key: getEnv("ENCRYPTION_KEY", "dev-encryption-key-change-me!!")
```

### 2. Start the server
```bash
cd backend
go run cmd/server/main.go
```

The server will automatically:
- Initialize email encryption on startup
- Use the default dev key
- Encrypt all new user emails automatically

### 3. Test it
```bash
# Register a new user with an email
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123", "email": "test@example.com"}'

# The email will be encrypted in the database
# But when you fetch the user, it will be automatically decrypted
```

## For Production

### 1. Generate a secure encryption key
```bash
openssl rand -base64 32
```

Example output:
```
K8vCZN0xQp2X9yBjL5mWh3R7fD1sA6tE4nU0oP2iV8g=
```

### 2. Set the environment variable
```bash
export ENCRYPTION_KEY="K8vCZN0xQp2X9yBjL5mWh3R7fD1sA6tE4nU0oP2iV8g="
```

Or add to your `.env` file or deployment configuration:
```
ENCRYPTION_KEY=K8vCZN0xQp2X9yBjL5mWh3R7fD1sA6tE4nU0oP2iV8g=
```

### 3. Deploy the application
The database migration will run automatically if `DB_AUTO_MIGRATE=true`.

### 4. Encrypt existing emails (if you have existing users)
```bash
cd backend
go run scripts/encrypt_existing_emails.go
```

This will:
- Find all users with plaintext emails
- Ask for confirmation
- Encrypt each email
- Report progress and results

### 5. Verify encryption
Check the database to see encrypted emails:
```sql
SELECT id, username, email, email_encrypted FROM users LIMIT 5;
```

You should see base64-encoded strings in the `email` column and `TRUE` in `email_encrypted`.

## Important Security Notes

⚠️ **DO NOT**:
- Commit the encryption key to git
- Share the encryption key in plain text
- Use the same key across environments
- Lose the encryption key (you won't be able to decrypt emails)

✅ **DO**:
- Use a different encryption key for each environment (dev, staging, prod)
- Store the production key in a secure secret manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Back up the encryption key in multiple secure locations
- Rotate keys periodically (at least annually)
- Document where the key is stored for your team

## Verify It's Working

### Check the application logs
When you start the server, you should see:
```
Email encryption initialized
```

### Test encryption in Go
```bash
cd backend
go test ./internal/utils -v -run TestEncrypt
```

All tests should pass.

## Troubleshooting

### "encryption key not set" error
Make sure the `ENCRYPTION_KEY` environment variable is set before starting the server.

### "invalid ciphertext" error
The encryption key may have changed. Make sure you're using the correct key for the environment.

### Can't decrypt emails
If you lost the encryption key, encrypted emails cannot be recovered. Always back up your encryption key!

## More Information

- Detailed documentation: `backend/docs/EMAIL_ENCRYPTION.md`
- Implementation summary: `EMAIL_ENCRYPTION_SUMMARY.md`
- Migration script: `backend/scripts/encrypt_existing_emails.go`
- Encryption code: `backend/internal/utils/encryption.go`
- Tests: `backend/internal/utils/encryption_test.go`
