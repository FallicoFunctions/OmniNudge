-- Generated media replies are real conversation turns so their attachments
-- can be linked, but they intentionally carry no visible text. Keep the
-- existing non-empty-content invariant for every other message.
ALTER TABLE bot_messages
    ADD COLUMN IF NOT EXISTS media_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE bot_messages
    DROP CONSTRAINT IF EXISTS bot_messages_content_check;

ALTER TABLE bot_messages
    ADD CONSTRAINT bot_messages_content_or_media_only_check
    CHECK (media_only OR char_length(content) > 0);
