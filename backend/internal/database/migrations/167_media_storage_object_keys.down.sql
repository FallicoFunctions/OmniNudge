DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM media_files
        WHERE storage_object_key IS DISTINCT FROM storage_path
    ) THEN
        RAISE EXCEPTION 'refusing to discard distinct media storage object keys';
    END IF;
END;
$$;

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

ALTER TABLE media_file_deletion_queue
    DROP COLUMN IF EXISTS storage_scope;

DROP TRIGGER IF EXISTS trg_default_media_storage_object_key ON media_files;
DROP FUNCTION IF EXISTS default_media_storage_object_key();
ALTER TABLE media_files DROP COLUMN IF EXISTS storage_object_key;
