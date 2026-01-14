-- Add table to store per-recipient encryption keys for multi-recipient messages (mod mail)
CREATE TABLE message_recipient_keys (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key TEXT NOT NULL, -- RSA-encrypted AES key for this specific recipient
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_recipient_keys_message ON message_recipient_keys(message_id);
CREATE INDEX idx_message_recipient_keys_user ON message_recipient_keys(user_id);

-- Add column to messages to indicate if this is a multi-recipient encrypted message
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_multi_recipient BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS shared_encryption_iv TEXT; -- Shared IV for multi-recipient encryption
