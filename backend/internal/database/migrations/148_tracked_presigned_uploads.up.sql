CREATE TABLE media_upload_intents (
    id                 UUID PRIMARY KEY,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_path       TEXT NOT NULL UNIQUE,
    original_filename  TEXT NOT NULL,
    content_type       TEXT NOT NULL,
    declared_size      BIGINT NOT NULL CHECK (declared_size > 0 AND declared_size <= 104857600),
    checksum_sha256    TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'failed')),
    confirmed_media_id INTEGER REFERENCES media_files(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ NOT NULL,
    confirmed_at       TIMESTAMPTZ,
    failure_reason     TEXT,
    CONSTRAINT media_upload_intents_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX idx_media_upload_intents_pending_expiry
    ON media_upload_intents(expires_at)
    WHERE status = 'pending';

CREATE INDEX idx_media_upload_intents_user_pending
    ON media_upload_intents(user_id, expires_at)
    WHERE status = 'pending';

CREATE UNIQUE INDEX idx_media_files_direct_upload_path_unique
    ON media_files(storage_path)
	WHERE storage_path LIKE 'pending-uploads/%';
