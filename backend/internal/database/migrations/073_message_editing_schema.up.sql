ALTER TABLE messages
ADD COLUMN IF NOT EXISTS edited boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS edited_at timestamptz,
ADD COLUMN IF NOT EXISTS original_content text;

CREATE TABLE IF NOT EXISTS message_edit_history (
    id serial PRIMARY KEY,
    message_id integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    content text,
    encrypted_content text,
    edited_at timestamptz NOT NULL DEFAULT now(),
    edited_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_edit_history_message_id
    ON message_edit_history (message_id);

CREATE INDEX IF NOT EXISTS idx_message_edit_history_edited_at
    ON message_edit_history (edited_at);

CREATE OR REPLACE FUNCTION cleanup_message_edit_history_retention()
RETURNS trigger AS $$
BEGIN
    -- Keep trigger cleanup bounded so inserts do not trigger full-table scans/deletes.
    DELETE FROM message_edit_history
    WHERE id IN (
        SELECT id
        FROM message_edit_history
        WHERE edited_at < now() - interval '30 days'
        ORDER BY edited_at ASC
        LIMIT 500
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_message_edit_history_retention ON message_edit_history;

CREATE TRIGGER trg_cleanup_message_edit_history_retention
    BEFORE INSERT ON message_edit_history
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_message_edit_history_retention();
