-- Restore the original message invariant after converting any media-only
-- rows to a whitespace-only marker that remains visually empty in the UI.
UPDATE bot_messages
SET content = ' '
WHERE media_only AND char_length(content) = 0;

ALTER TABLE bot_messages
    DROP CONSTRAINT IF EXISTS bot_messages_content_or_media_only_check;

ALTER TABLE bot_messages
    ADD CONSTRAINT bot_messages_content_check
    CHECK (char_length(content) > 0);

ALTER TABLE bot_messages
    DROP COLUMN IF EXISTS media_only;
