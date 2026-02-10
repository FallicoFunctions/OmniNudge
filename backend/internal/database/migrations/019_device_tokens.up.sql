-- Device tokens for push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    device_type VARCHAR(20) NOT NULL, -- 'web', 'ios', 'android'
    device_name VARCHAR(100), -- User-friendly device name
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_device_type CHECK (device_type IN ('web', 'ios', 'android'))
);

-- Index for fast lookup by user
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

-- Index for fast lookup by token (for validation)
CREATE INDEX idx_device_tokens_token ON device_tokens(token);

-- Index for cleanup of stale tokens
CREATE INDEX idx_device_tokens_last_used ON device_tokens(last_used_at DESC);
