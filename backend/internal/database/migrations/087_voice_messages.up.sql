CREATE TABLE voice_messages (
    id               SERIAL        PRIMARY KEY,
    message_id       INTEGER       NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    duration_seconds NUMERIC(6,1)  NOT NULL,
    waveform_data    JSONB,
    transcription    TEXT,
    storage_key      TEXT          NOT NULL,
    file_size        BIGINT        NOT NULL,
    mime_type        VARCHAR(50)   NOT NULL DEFAULT 'audio/webm',
    scan_status      VARCHAR(20)   NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','infected','skipped')),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vm_message_id ON voice_messages (message_id);
