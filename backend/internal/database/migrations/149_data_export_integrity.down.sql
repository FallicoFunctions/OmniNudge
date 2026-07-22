DROP INDEX IF EXISTS idx_data_export_requests_active_user;

UPDATE data_export_requests
SET status = 'failed'
WHERE status = 'expired';

ALTER TABLE data_export_requests
    DROP CONSTRAINT valid_status;

ALTER TABLE data_export_requests
    ADD CONSTRAINT valid_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE export_session_keys
    RENAME COLUMN encrypted_key TO decrypted_key_base64;
