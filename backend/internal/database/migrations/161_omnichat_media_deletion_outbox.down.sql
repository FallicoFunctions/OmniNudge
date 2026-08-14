DROP TRIGGER IF EXISTS trg_queue_deleted_omnichat_media_object ON media_files;
DROP FUNCTION IF EXISTS queue_deleted_omnichat_media_object();
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'omnichat_media_deletion_queue'
    ) AND EXISTS (
        SELECT 1 FROM omnichat_media_deletion_queue
    ) THEN
        RAISE EXCEPTION 'refusing to drop non-empty OmniChat media deletion queue';
    END IF;
END;
$$;
DROP TABLE IF EXISTS omnichat_media_deletion_queue;
