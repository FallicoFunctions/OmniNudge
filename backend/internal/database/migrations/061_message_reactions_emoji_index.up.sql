-- Feature 1: Message Reactions – performance index
-- Add composite index on (message_id, emoji) to optimize the hot-path query
-- inside AddReaction that checks whether an emoji type already exists on a
-- message before deciding whether to increment the 10-unique-emoji cap counter.
-- Without this index the cap check requires a full table scan over all reactions
-- for a given message.

CREATE INDEX idx_message_reactions_message_emoji
    ON message_reactions(message_id, emoji);
