CREATE TABLE IF NOT EXISTS oauth_pending_signups (
    token              VARCHAR(64) PRIMARY KEY,
    provider           VARCHAR(50)  NOT NULL,
    provider_user_id   VARCHAR(255) NOT NULL,
    email              VARCHAR(255),
    name               VARCHAR(255),
    avatar_url         TEXT,
    suggested_username VARCHAR(50)  NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_signups_expires_at ON oauth_pending_signups(expires_at);
