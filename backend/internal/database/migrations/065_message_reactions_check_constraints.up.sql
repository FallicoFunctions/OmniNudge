-- Defense-in-depth: ensure the emoji column can never be empty or exceed 100
-- bytes at the database level, mirroring the application-layer validation in
-- isValidEmoji().  Existing rows are guaranteed to satisfy these constraints
-- because the application layer was already enforcing them.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'message_reactions_emoji_not_empty'
    ) THEN
        ALTER TABLE message_reactions
            ADD CONSTRAINT message_reactions_emoji_not_empty CHECK (emoji <> '');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'message_reactions_emoji_max_bytes'
    ) THEN
        ALTER TABLE message_reactions
            ADD CONSTRAINT message_reactions_emoji_max_bytes CHECK (octet_length(emoji) <= 100);
    END IF;
END $$;
