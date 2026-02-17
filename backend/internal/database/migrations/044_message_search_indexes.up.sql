-- Message search performance indexes for F0-003
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_messages_sender_sent_at
ON messages (sender_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender_sent_at
ON messages (conversation_id, sender_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_encrypted_content_trgm
ON messages USING gin (lower(sender_encrypted_content) gin_trgm_ops)
WHERE sender_encrypted_content IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_encrypted_content_trgm
ON messages USING gin (lower(encrypted_content) gin_trgm_ops);
