CREATE INDEX IF NOT EXISTS idx_omnichat_media_deletion_queue_queued
    ON omnichat_media_deletion_queue(queued_at);
DROP INDEX IF EXISTS idx_omnichat_media_deletion_queue_eligible;

ALTER TABLE omnichat_media_deletion_queue
    DROP COLUMN IF EXISTS dead_lettered_at,
    DROP COLUMN IF EXISTS last_error_code,
    DROP COLUMN IF EXISTS next_attempt_at,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS owner_user_id;

CREATE OR REPLACE FUNCTION queue_deleted_omnichat_media_object()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.storage_path LIKE 'omnichat/generated/%' THEN
        INSERT INTO omnichat_media_deletion_queue(storage_path)
        VALUES (OLD.storage_path)
        ON CONFLICT (storage_path) DO NOTHING;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
