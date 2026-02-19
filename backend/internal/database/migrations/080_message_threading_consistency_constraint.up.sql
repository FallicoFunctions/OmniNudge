DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_threading_consistency'
          AND conrelid = 'messages'::regclass
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT messages_threading_consistency
        CHECK (
            (reply_to IS NULL AND thread_root IS NULL)
            OR
            (reply_to IS NOT NULL AND thread_root IS NOT NULL)
        );
    END IF;
END $$;
