-- Add sender-specific encryption fields and allow longer media types
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS sender_encrypted_content TEXT,
    ADD COLUMN IF NOT EXISTS sender_media_encryption_key TEXT;

-- Allow MIME types longer than 20 characters
ALTER TABLE messages
    ALTER COLUMN media_type TYPE VARCHAR(128);
