CREATE TABLE auth_sessions (
    id                 UUID PRIMARY KEY,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash BYTEA NOT NULL,
    csrf_token_hash    BYTEA NOT NULL,
    token_version      INTEGER NOT NULL,
    user_agent         TEXT NOT NULL DEFAULT '',
    ip_address         INET,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX idx_auth_sessions_user_active
    ON auth_sessions(user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_auth_sessions_expiry
    ON auth_sessions(expires_at)
    WHERE revoked_at IS NULL;
