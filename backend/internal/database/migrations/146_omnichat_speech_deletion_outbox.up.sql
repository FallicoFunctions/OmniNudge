-- Deleting a speech row can happen through user, persona, conversation, or
-- message cascades. Storage cannot participate in those transactions, so keep
-- an idempotent durable record until the retention worker removes the blob.
CREATE TABLE IF NOT EXISTS omnichat_speech_deletion_queue (
    storage_path TEXT PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION enqueue_omnichat_speech_object_deletion()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO omnichat_speech_deletion_queue(storage_path)
    VALUES (OLD.storage_path)
    ON CONFLICT (storage_path) DO NOTHING;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_omnichat_speech_object_deletion ON omnichat_speech_audio;
CREATE TRIGGER trg_enqueue_omnichat_speech_object_deletion
AFTER DELETE ON omnichat_speech_audio
FOR EACH ROW EXECUTE FUNCTION enqueue_omnichat_speech_object_deletion();

CREATE INDEX IF NOT EXISTS idx_omnichat_speech_deletion_queue_created_at
    ON omnichat_speech_deletion_queue(created_at);
