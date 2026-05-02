-- GDPR Data Export Requests (P0-016)
CREATE TABLE IF NOT EXISTS data_export_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    export_id VARCHAR(100) NOT NULL UNIQUE,
    data_types TEXT[] NOT NULL, -- Array of data types: profile, messages, posts, etc.
    include_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    file_size_bytes BIGINT, -- Size of the export file
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- When the download link expires (7 days after completion)
    error_message TEXT, -- Error details if failed
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Index for user lookups
CREATE INDEX idx_data_export_requests_user ON data_export_requests(user_id);

-- Index for cleanup queries (find expired exports)
CREATE INDEX idx_data_export_requests_expires ON data_export_requests(expires_at) WHERE status = 'completed';
