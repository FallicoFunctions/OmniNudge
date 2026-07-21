CREATE TABLE IF NOT EXISTS omnichat_persona_voices (
    persona_id        INTEGER PRIMARY KEY REFERENCES bot_personas(id) ON DELETE CASCADE,
    provider          VARCHAR(20) NOT NULL DEFAULT 'browser' CHECK (provider IN ('browser', 'elevenlabs')),
    voice_id          VARCHAR(128) NOT NULL,
    voice_name        VARCHAR(100) NOT NULL,
    model_id          VARCHAR(100) NOT NULL DEFAULT 'eleven_multilingual_v2',
    stability         REAL NOT NULL DEFAULT 0.5 CHECK (stability BETWEEN 0 AND 1),
    similarity_boost  REAL NOT NULL DEFAULT 0.75 CHECK (similarity_boost BETWEEN 0 AND 1),
    style             REAL NOT NULL DEFAULT 0 CHECK (style BETWEEN 0 AND 1),
    speed             REAL NOT NULL DEFAULT 1 CHECK (speed BETWEEN 0.7 AND 1.2),
    language_code     VARCHAR(8),
    configured_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS omnichat_speech_audio (
    id                  UUID PRIMARY KEY,
    owner_user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id          INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
    message_id          INTEGER NOT NULL REFERENCES bot_messages(id) ON DELETE CASCADE,
    text_hash           CHAR(64) NOT NULL,
    voice_config_hash   CHAR(64) NOT NULL,
    storage_path        TEXT NOT NULL UNIQUE,
    file_type           VARCHAR(40) NOT NULL DEFAULT 'audio/mpeg',
    file_size           BIGINT NOT NULL CHECK (file_size BETWEEN 1 AND 10485760),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    UNIQUE (message_id, text_hash, voice_config_hash)
);
CREATE INDEX IF NOT EXISTS idx_omnichat_speech_audio_expiry ON omnichat_speech_audio(expires_at);

CREATE TABLE IF NOT EXISTS omnichat_call_sessions (
    id                  UUID PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id          INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    conversation_id     INTEGER NOT NULL REFERENCES bot_conversations(id) ON DELETE CASCADE,
    mode                VARCHAR(10) NOT NULL CHECK (mode IN ('voice', 'video')),
    status              VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'failed')),
    recording_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    turn_count          INTEGER NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_omnichat_call_sessions_user_active
    ON omnichat_call_sessions(user_id, started_at DESC) WHERE status='active';
