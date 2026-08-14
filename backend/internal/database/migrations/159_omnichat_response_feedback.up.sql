CREATE TABLE omnichat_response_feedback (
    id UUID PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL REFERENCES bot_conversations(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES bot_messages(id) ON DELETE CASCADE,
    persona_id INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    preceding_user_message_id INTEGER REFERENCES bot_messages(id) ON DELETE SET NULL,
    reason VARCHAR(32) NOT NULL CHECK (reason IN (
        'role_ownership',
        'user_agency',
        'narration_format',
        'repetition_length',
        'grammar_artifact',
        'character_mismatch',
        'other'
    )),
    note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
    response_snapshot TEXT NOT NULL CHECK (char_length(response_snapshot) BETWEEN 1 AND 20000),
    preceding_user_snapshot TEXT NOT NULL DEFAULT '' CHECK (char_length(preceding_user_snapshot) <= 10000),
    response_hash CHAR(64) NOT NULL CHECK (response_hash ~ '^[0-9a-f]{64}$'),
    scene_state_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scene_state_snapshot) = 'object'),
    status VARCHAR(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'promoted', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_user_id, message_id, response_hash)
);

CREATE INDEX idx_omnichat_response_feedback_status_created
    ON omnichat_response_feedback (status, created_at DESC);

CREATE INDEX idx_omnichat_response_feedback_owner_created
    ON omnichat_response_feedback (owner_user_id, created_at DESC);

CREATE INDEX idx_omnichat_response_feedback_persona_reason
    ON omnichat_response_feedback (persona_id, reason, created_at DESC);
