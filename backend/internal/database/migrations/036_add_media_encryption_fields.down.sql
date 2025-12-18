-- Remove media encryption fields
ALTER TABLE messages DROP COLUMN IF EXISTS media_encryption_key;
ALTER TABLE messages DROP COLUMN IF EXISTS media_encryption_iv;
