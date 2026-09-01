-- How a character decides the way she writes.
--
-- 'default' is what every character does today: she writes the way she was
-- made to. 'mirror' means she writes the way the person she is talking to
-- writes -- message length, how many messages at a time, and whether asterisked
-- action appears at all.
--
-- The point of mirror is that nobody imposes the format. A creator picking a
-- style from a menu is a guess about a reader he has never met; the reader
-- teaches it instead, by example, without being asked.
--
-- Only a roleplay character may mirror, and the CHECK says so rather than a
-- comment. An OmniAI already writes however she wants: telling her to copy
-- somebody would be the platform deciding her style, which is the thing §13
-- stops us doing.
ALTER TABLE bot_personas
    ADD COLUMN IF NOT EXISTS message_style_mode TEXT NOT NULL DEFAULT 'default';

ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_message_style_mode_check;
ALTER TABLE bot_personas
    ADD CONSTRAINT bot_personas_message_style_mode_check
        CHECK (message_style_mode IN ('default', 'mirror'));

ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_only_roleplay_mirrors_check;
ALTER TABLE bot_personas
    ADD CONSTRAINT bot_personas_only_roleplay_mirrors_check
        CHECK (message_style_mode = 'default' OR response_style_profile <> 'direct_message');
