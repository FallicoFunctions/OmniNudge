ALTER TABLE omnichat_call_sessions
    ADD COLUMN IF NOT EXISTS provider VARCHAR(20) CHECK (provider IS NULL OR provider IN ('tavus')),
    ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_omnichat_call_sessions_provider_session
    ON omnichat_call_sessions(provider, provider_session_id)
    WHERE provider_session_id IS NOT NULL;

ALTER TABLE omnichat_persona_voices
    ADD COLUMN IF NOT EXISTS live_video_replica_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS live_video_persona_id VARCHAR(128),
    ADD CONSTRAINT omnichat_persona_voice_live_video_pair
        CHECK ((live_video_replica_id IS NULL) = (live_video_persona_id IS NULL));
