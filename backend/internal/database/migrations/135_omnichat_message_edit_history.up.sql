CREATE TABLE bot_message_edit_history (
    id BIGSERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES bot_messages(id) ON DELETE CASCADE,
    previous_content TEXT NOT NULL CHECK (char_length(previous_content) > 0),
    edited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bot_message_edit_history_message_time
    ON bot_message_edit_history (message_id, edited_at DESC);
