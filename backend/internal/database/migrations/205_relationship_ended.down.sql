-- Back to a relationship having no way to say it ended. Whichever ones had
-- ended read as current again, which is wrong and is the best available: the
-- alternative is deleting them, and deleting them is the mistake this column
-- was added to undo.
ALTER TABLE omnichat_character_traits
    DROP CONSTRAINT IF EXISTS omnichat_character_traits_ended_is_relational;
ALTER TABLE omnichat_character_traits
    DROP COLUMN IF EXISTS ended_at;
