-- Feature 1: Message Reactions
-- Creates the message_reactions table for emoji reactions on messages.
-- The 10 unique-emoji-per-message limit is enforced at the application layer.

CREATE TABLE message_reactions (
    id         SERIAL PRIMARY KEY,
    message_id INTEGER     NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    emoji      VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_message_user_emoji UNIQUE (message_id, user_id, emoji)
);

-- Fast lookups by message (fetch all reactions for a message)
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);

-- Fast lookups by user (fetch all messages a user has reacted to)
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);
