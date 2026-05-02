ALTER TABLE users
ADD COLUMN IF NOT EXISTS reddit_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS reddit_username VARCHAR(50),
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_reddit_id_key'
    ) THEN
        ALTER TABLE ONLY users
            ADD CONSTRAINT users_reddit_id_key UNIQUE (reddit_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_reddit_id
    ON users (reddit_id)
    WHERE reddit_id IS NOT NULL;

ALTER TABLE data_export_requests
ADD COLUMN IF NOT EXISTS download_url TEXT;
