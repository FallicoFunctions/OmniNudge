-- Separate filesystem-facing paths from object-store keys. Legacy multipart
-- uploads wrote `uploads/name` to the database but used `name` as the storage
-- service key; retaining both prevents cleanup from acknowledging the wrong
-- object (S3 DELETE is successful even when the key never existed).
ALTER TABLE media_files
    ADD COLUMN IF NOT EXISTS storage_object_key TEXT;

UPDATE media_files
SET storage_object_key = CASE
    WHEN storage_path ~ '^uploads/[^/]+$'
        THEN substring(storage_path FROM char_length('uploads/') + 1)
    WHEN storage_path ~ '^uploads/voice/[^/]+$'
        THEN substring(storage_path FROM char_length('uploads/') + 1)
    ELSE storage_path
END
WHERE storage_object_key IS NULL
  AND storage_path IS NOT NULL
  AND storage_path <> '';

CREATE OR REPLACE FUNCTION default_media_storage_object_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.storage_object_key IS NULL OR NEW.storage_object_key = '' THEN
        NEW.storage_object_key := NEW.storage_path;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_default_media_storage_object_key ON media_files;
CREATE TRIGGER trg_default_media_storage_object_key
BEFORE INSERT OR UPDATE OF storage_path, storage_object_key ON media_files
FOR EACH ROW EXECUTE FUNCTION default_media_storage_object_key();

ALTER TABLE media_file_deletion_queue
    ADD COLUMN IF NOT EXISTS storage_scope VARCHAR(24) NOT NULL DEFAULT 'legacy_unscoped'
        CHECK (storage_scope IN ('canonical_owned', 'legacy_unscoped'));

UPDATE media_file_deletion_queue
SET storage_scope = CASE
    WHEN storage_path ~ '^[1-9][0-9]*/'
      OR storage_path ~ '^uploads/[1-9][0-9]*/'
      OR storage_path ~ '^pending-uploads/[1-9][0-9]*/'
        THEN 'canonical_owned'
    ELSE 'legacy_unscoped'
END;

-- Repair already queued legacy multipart objects before the row that carried
-- their separate filesystem path is gone.
WITH legacy AS (
    SELECT storage_path,
           substring(storage_path FROM char_length('uploads/') + 1) AS object_key,
           owner_user_id,status,attempts,queued_at,next_attempt_at,last_error_at,
           last_error_code,dead_lettered_at
    FROM media_file_deletion_queue
    WHERE storage_path ~ '^uploads/[^/]+$'
)
INSERT INTO media_file_deletion_queue(
    storage_path,owner_user_id,status,attempts,queued_at,next_attempt_at,
    last_error_at,last_error_code,dead_lettered_at,storage_scope
)
SELECT object_key,owner_user_id,status,attempts,queued_at,next_attempt_at,
       last_error_at,last_error_code,dead_lettered_at,'legacy_unscoped'
FROM legacy
ON CONFLICT (storage_path) DO NOTHING;

DELETE FROM media_file_deletion_queue
WHERE storage_path ~ '^uploads/[^/]+$';

CREATE OR REPLACE FUNCTION queue_deleted_media_file_object()
RETURNS TRIGGER AS $$
DECLARE
    object_key TEXT;
    object_scope VARCHAR(24);
BEGIN
    object_key := COALESCE(NULLIF(OLD.storage_object_key, ''), OLD.storage_path);
    IF object_key IS NOT NULL
       AND object_key <> ''
       AND object_key NOT LIKE 'omnichat/generated/%' THEN
        IF object_key ~ ('^' || OLD.user_id::TEXT || '/')
           OR object_key ~ ('^uploads/' || OLD.user_id::TEXT || '/')
           OR object_key ~ ('^pending-uploads/' || OLD.user_id::TEXT || '/') THEN
            object_scope := 'canonical_owned';
        ELSE
            object_scope := 'legacy_unscoped';
        END IF;
        INSERT INTO media_file_deletion_queue(
            storage_path, owner_user_id, storage_scope
        )
        VALUES (object_key, OLD.user_id, object_scope)
        ON CONFLICT (storage_path) DO UPDATE
        SET owner_user_id = EXCLUDED.owner_user_id,
            storage_scope = EXCLUDED.storage_scope,
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
DECLARE
    object_key TEXT;
BEGIN
    object_key := COALESCE(NULLIF(OLD.storage_object_key, ''), OLD.storage_path);
    IF object_key LIKE 'omnichat/generated/%' THEN
        INSERT INTO omnichat_media_deletion_queue(
            storage_path, owner_user_id, status, next_attempt_at
        )
        VALUES (object_key, OLD.user_id, 'pending', NOW())
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
