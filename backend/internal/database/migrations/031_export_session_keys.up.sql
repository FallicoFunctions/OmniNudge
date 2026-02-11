-- Migration: 031_export_session_keys
-- Purpose: Temporary storage for decrypted group keys during Data Export (P0-016)

CREATE TABLE IF NOT EXISTS export_session_keys (
    id SERIAL PRIMARY KEY,
    export_id VARCHAR(100) NOT NULL REFERENCES data_export_requests(export_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_key_id INTEGER NOT NULL, -- Reference to group_encryption_keys(id)
    decrypted_key_base64 TEXT NOT NULL, -- The group AES key, encrypted with SYSTEM_MASTER_KEY
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX idx_export_session_key_export ON export_session_keys(export_id);
CREATE INDEX idx_export_session_key_expires ON export_session_keys(expires_at);

-- Add column for System Master Key version to data_export_requests if needed, 
-- or just assume current active system key.
