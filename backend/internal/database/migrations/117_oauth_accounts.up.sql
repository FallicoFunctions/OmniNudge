CREATE TABLE IF NOT EXISTS oauth_accounts (
    id               SERIAL PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         VARCHAR(50)  NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email            VARCHAR(255),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_oauth_provider_user UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
