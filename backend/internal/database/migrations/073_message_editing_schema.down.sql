DROP TRIGGER IF EXISTS trg_cleanup_message_edit_history_retention ON message_edit_history;
DROP FUNCTION IF EXISTS cleanup_message_edit_history_retention();

DROP INDEX IF EXISTS idx_message_edit_history_edited_at;
DROP INDEX IF EXISTS idx_message_edit_history_message_id;
DROP TABLE IF EXISTS message_edit_history;

ALTER TABLE messages
DROP COLUMN IF EXISTS original_content,
DROP COLUMN IF EXISTS edited_at,
DROP COLUMN IF EXISTS edited;
