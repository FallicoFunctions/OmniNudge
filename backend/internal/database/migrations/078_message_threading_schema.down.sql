DROP INDEX IF EXISTS idx_messages_thread_root_sent_at;
DROP INDEX IF EXISTS idx_messages_thread_root;
DROP INDEX IF EXISTS idx_messages_reply_to;

ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_reply_count_non_negative;

ALTER TABLE messages
DROP COLUMN IF EXISTS reply_count,
DROP COLUMN IF EXISTS thread_root,
DROP COLUMN IF EXISTS reply_to;
