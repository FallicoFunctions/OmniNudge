-- Non-generated user uploads also need post-commit object cleanup. Keeping
-- object deletion outside the transaction avoids the irreversible sequence
-- "delete blob, then roll back its database row".
CREATE TABLE IF NOT EXISTS media_file_deletion_queue (
    storage_path       TEXT PRIMARY KEY,
    owner_user_id      INTEGER NOT NULL,
    status             VARCHAR(16) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'dead_letter')),
    attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    queued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_attempt_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error_at      TIMESTAMPTZ,
    last_error_code    VARCHAR(64),
    dead_lettered_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_file_deletion_queue_eligible
    ON media_file_deletion_queue(next_attempt_at, queued_at)
    WHERE status = 'pending';

CREATE OR REPLACE FUNCTION queue_deleted_media_file_object()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.storage_path IS NOT NULL
       AND OLD.storage_path <> ''
       AND OLD.storage_path NOT LIKE 'omnichat/generated/%' THEN
        INSERT INTO media_file_deletion_queue(storage_path, owner_user_id)
        VALUES (OLD.storage_path, OLD.user_id)
        ON CONFLICT (storage_path) DO UPDATE
        SET owner_user_id = EXCLUDED.owner_user_id,
            status = 'pending',
            next_attempt_at = NOW(),
            last_error_code = NULL,
            dead_lettered_at = NULL;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_deleted_media_file_object ON media_files;
CREATE TRIGGER trg_queue_deleted_media_file_object
AFTER DELETE ON media_files
FOR EACH ROW EXECUTE FUNCTION queue_deleted_media_file_object();
