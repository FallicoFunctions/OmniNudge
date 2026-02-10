-- Migration 024: Password Reset Tokens
-- Purpose: Enable password reset functionality via email
-- Date: 2026-02-08

-- Create password_resets table
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at);

-- Add comment
COMMENT ON TABLE password_resets IS 'Stores password reset tokens for user password recovery';
COMMENT ON COLUMN password_resets.token IS 'Secure random token for password reset (URL-safe base64)';
COMMENT ON COLUMN password_resets.expires_at IS 'Token expiration time (1 hour from creation)';
COMMENT ON COLUMN password_resets.used_at IS 'When the token was used (NULL if unused)';
