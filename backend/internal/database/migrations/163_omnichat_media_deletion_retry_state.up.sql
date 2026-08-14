-- Make generated-media object deletion observable and non-starving. Invalid
-- keys are quarantined once; transient storage failures retry with bounded
-- exponential backoff and eventually dead-letter for operator review.
ALTER TABLE omnichat_media_deletion_queue
    ADD COLUMN IF NOT EXISTS owner_user_id INTEGER,
    ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'dead_letter')),
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(64),
    ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

UPDATE omnichat_media_deletion_queue
SET owner_user_id = NULLIF(split_part(storage_path, '/', 3), '')::INTEGER
WHERE owner_user_id IS NULL
  AND storage_path ~ '^omnichat/generated/[1-9][0-9]*/';

DROP INDEX IF EXISTS idx_omnichat_media_deletion_queue_queued;
CREATE INDEX IF NOT EXISTS idx_omnichat_media_deletion_queue_eligible
    ON omnichat_media_deletion_queue(next_attempt_at, queued_at)
    WHERE status = 'pending';

CREATE OR REPLACE FUNCTION queue_deleted_omnichat_media_object()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.storage_path LIKE 'omnichat/generated/%' THEN
        INSERT INTO omnichat_media_deletion_queue(
            storage_path, owner_user_id, status, next_attempt_at
        )
        VALUES (OLD.storage_path, OLD.user_id, 'pending', NOW())
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
