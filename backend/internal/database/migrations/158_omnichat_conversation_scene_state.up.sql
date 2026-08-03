CREATE TABLE omnichat_conversation_scene_states (
    conversation_id INTEGER PRIMARY KEY REFERENCES bot_conversations(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_turn_actor VARCHAR(256) NOT NULL,
    subject VARCHAR(256) NOT NULL,
    action VARCHAR(256) NOT NULL,
    target VARCHAR(256) NOT NULL,
    action_status VARCHAR(16) NOT NULL CHECK (action_status IN ('proposed', 'completed')),
    location VARCHAR(256) NOT NULL,
    state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_omnichat_scene_states_owner_updated
    ON omnichat_conversation_scene_states (owner_user_id, updated_at DESC);

CREATE TABLE omnichat_conversation_scene_state_checkpoints (
    conversation_id INTEGER NOT NULL REFERENCES bot_conversations(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES bot_messages(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_revision BIGINT NOT NULL CHECK (source_revision > 0),
    state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX idx_omnichat_scene_checkpoints_lookup
    ON omnichat_conversation_scene_state_checkpoints (conversation_id, owner_user_id, message_id DESC);
