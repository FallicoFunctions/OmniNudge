ALTER TABLE message_reactions
    DROP CONSTRAINT IF EXISTS message_reactions_emoji_not_empty,
    DROP CONSTRAINT IF EXISTS message_reactions_emoji_max_bytes;
