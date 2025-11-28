DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'user_settings'
          AND column_name = 'auto_append_invitation'
    ) THEN
        ALTER TABLE user_settings
        ADD COLUMN auto_append_invitation BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;
