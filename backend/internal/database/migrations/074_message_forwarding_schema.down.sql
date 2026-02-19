DROP INDEX IF EXISTS idx_messages_forwarded_from;

ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_forward_count_non_negative,
DROP COLUMN IF EXISTS forwarded_from,
DROP COLUMN IF EXISTS forward_count;
