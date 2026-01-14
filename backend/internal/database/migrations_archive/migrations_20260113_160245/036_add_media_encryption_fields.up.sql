-- Add fields for media file encryption (hybrid AES+RSA)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_encryption_key TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_encryption_iv TEXT;

-- Add comment explaining the encryption scheme
COMMENT ON COLUMN messages.media_encryption_key IS 'RSA-encrypted AES key for media file decryption (Base64)';
COMMENT ON COLUMN messages.media_encryption_iv IS 'AES-GCM initialization vector for media file decryption (Base64)';
