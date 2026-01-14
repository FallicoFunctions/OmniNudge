-- Rollback multi-recipient encryption support
ALTER TABLE messages DROP COLUMN IF EXISTS shared_encryption_iv;
ALTER TABLE messages DROP COLUMN IF EXISTS is_multi_recipient;

DROP TABLE IF EXISTS message_recipient_keys;
