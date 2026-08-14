CREATE TABLE omnichat_model_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_model_key VARCHAR(16) NOT NULL DEFAULT 'free',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT omnichat_model_preferences_key_check
        CHECK (default_model_key IN ('free', 'plus', 'premium'))
);

ALTER TABLE bot_conversations
    ADD COLUMN model_override_key VARCHAR(16),
    ADD CONSTRAINT bot_conversations_model_override_key_check
        CHECK (model_override_key IS NULL OR model_override_key IN ('free', 'plus', 'premium'));

ALTER TABLE users
    ADD CONSTRAINT users_plan_tier_check CHECK (plan IN ('free', 'plus', 'premium'));
