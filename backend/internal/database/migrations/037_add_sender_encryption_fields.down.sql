ALTER TABLE messages
    DROP COLUMN IF EXISTS sender_encrypted_content,
    DROP COLUMN IF EXISTS sender_media_encryption_key;

ALTER TABLE messages
    ALTER COLUMN media_type TYPE VARCHAR(20);
