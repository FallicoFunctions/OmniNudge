DROP TRIGGER IF EXISTS trg_queue_deleted_media_file_object ON media_files;
DROP FUNCTION IF EXISTS queue_deleted_media_file_object();
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'media_file_deletion_queue'
    ) AND EXISTS (
        SELECT 1 FROM media_file_deletion_queue
    ) THEN
        RAISE EXCEPTION 'refusing to drop non-empty media-file deletion queue';
    END IF;
END;
$$;
DROP TABLE IF EXISTS media_file_deletion_queue;
