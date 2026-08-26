-- Drops the column and both constraints with it. Any character set to mirror
-- goes back to writing the way she was made to, which is the only answer
-- available once there is nowhere to record the choice.
ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_only_roleplay_mirrors_check;
ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_message_style_mode_check;
ALTER TABLE bot_personas
    DROP COLUMN IF EXISTS message_style_mode;
