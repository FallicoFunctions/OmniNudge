-- Durable deletion outbox for generated OmniChat media. Database ownership
-- state is removed transactionally; the retention worker retries object
-- deletion until storage confirms success.
CREATE TABLE IF NOT EXISTS omnichat_media_deletion_queue (
    storage_path TEXT PRIMARY KEY,
    queued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_omnichat_media_deletion_queue_queued
    ON omnichat_media_deletion_queue(queued_at);

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

DROP TRIGGER IF EXISTS trg_queue_deleted_omnichat_media_object ON media_files;
CREATE TRIGGER trg_queue_deleted_omnichat_media_object
AFTER DELETE ON media_files
FOR EACH ROW EXECUTE FUNCTION queue_deleted_omnichat_media_object();
