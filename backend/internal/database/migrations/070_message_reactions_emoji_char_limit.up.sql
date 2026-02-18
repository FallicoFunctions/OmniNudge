-- Defense-in-depth: enforce the reaction emoji character cap at the DB layer
-- to match backend validation rules.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'message_reactions_emoji_max_chars'
    ) THEN
        ALTER TABLE message_reactions
            ADD CONSTRAINT message_reactions_emoji_max_chars
            CHECK (char_length(emoji) <= 10);
    END IF;
END $$;
