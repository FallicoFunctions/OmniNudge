ALTER TABLE messages
ADD COLUMN IF NOT EXISTS forwarded_from INTEGER REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS forward_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_forward_count_non_negative'
          AND conrelid = 'messages'::regclass
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT messages_forward_count_non_negative
        CHECK (forward_count >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_forwarded_from
    ON messages (forwarded_from);
