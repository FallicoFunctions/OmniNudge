ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS thread_root INTEGER REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_reply_count_non_negative'
          AND conrelid = 'messages'::regclass
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT messages_reply_count_non_negative
        CHECK (reply_count >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
    ON messages (reply_to);

CREATE INDEX IF NOT EXISTS idx_messages_thread_root
    ON messages (thread_root);

-- messages currently use sent_at as the message chronology timestamp.
CREATE INDEX IF NOT EXISTS idx_messages_thread_root_sent_at
    ON messages (thread_root, sent_at);
