-- Restore the table exactly as 213 dropped it: the shape after 149 renamed
-- decrypted_key_base64 to encrypted_key, because 149's own down migration
-- renames encrypted_key back and would fail against the older spelling.
--
-- The original carried no unique constraint on (export_id, group_key_id),
-- only this primary key, these two foreign keys and these two indexes.
CREATE TABLE IF NOT EXISTS export_session_keys (
    id SERIAL PRIMARY KEY,
    export_id VARCHAR(100) NOT NULL REFERENCES data_export_requests(export_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_key_id INTEGER NOT NULL, -- Reference to group_encryption_keys(id)
    encrypted_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_export_session_key_export ON export_session_keys(export_id);
CREATE INDEX IF NOT EXISTS idx_export_session_key_expires ON export_session_keys(expires_at);
