CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id          BIGSERIAL PRIMARY KEY,
    identifier  VARCHAR(255) NOT NULL,
    ip_address  INET,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_failed_login_identifier ON failed_login_attempts(identifier);
CREATE INDEX idx_failed_login_attempted_at ON failed_login_attempts(attempted_at);
