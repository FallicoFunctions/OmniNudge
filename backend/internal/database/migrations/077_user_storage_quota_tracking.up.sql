ALTER TABLE users
ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0;

-- Backfill from existing media records.
UPDATE users u
SET storage_used_bytes = COALESCE(m.total_size, 0)
FROM (
    SELECT user_id, COALESCE(SUM(file_size), 0) AS total_size
    FROM media_files
    GROUP BY user_id
) m
WHERE u.id = m.user_id;

UPDATE users
SET storage_used_bytes = 0
WHERE id NOT IN (SELECT DISTINCT user_id FROM media_files);

CREATE OR REPLACE FUNCTION sync_user_storage_used_bytes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users
        SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) + COALESCE(NEW.file_size, 0))
        WHERE id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users
        SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) - COALESCE(OLD.file_size, 0))
        WHERE id = OLD.user_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.user_id = OLD.user_id THEN
            UPDATE users
            SET storage_used_bytes = GREATEST(
                0,
                COALESCE(storage_used_bytes, 0) + COALESCE(NEW.file_size, 0) - COALESCE(OLD.file_size, 0)
            )
            WHERE id = NEW.user_id;
        ELSE
            UPDATE users
            SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) - COALESCE(OLD.file_size, 0))
            WHERE id = OLD.user_id;
            UPDATE users
            SET storage_used_bytes = GREATEST(0, COALESCE(storage_used_bytes, 0) + COALESCE(NEW.file_size, 0))
            WHERE id = NEW.user_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_storage_used_bytes ON media_files;
CREATE TRIGGER trg_sync_user_storage_used_bytes
AFTER INSERT OR UPDATE OF file_size, user_id OR DELETE ON media_files
FOR EACH ROW
EXECUTE FUNCTION sync_user_storage_used_bytes();
