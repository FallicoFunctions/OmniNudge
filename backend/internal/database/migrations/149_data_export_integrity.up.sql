-- Align the temporary-key schema with the encrypted-at-rest implementation and
-- allow retention to record the terminal expired state.
ALTER TABLE export_session_keys
    RENAME COLUMN decrypted_key_base64 TO encrypted_key;

ALTER TABLE data_export_requests
    DROP CONSTRAINT valid_status;

ALTER TABLE data_export_requests
    ADD CONSTRAINT valid_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired'));

CREATE INDEX idx_data_export_requests_active_user
    ON data_export_requests(user_id, created_at DESC)
    WHERE status IN ('pending', 'processing');
