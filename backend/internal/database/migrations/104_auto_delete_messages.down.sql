DROP INDEX IF EXISTS idx_messages_delete_at;
ALTER TABLE conversation_participants DROP COLUMN IF EXISTS auto_delete_after;
ALTER TABLE messages DROP COLUMN IF EXISTS delete_at;
