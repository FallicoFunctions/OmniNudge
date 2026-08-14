ALTER TABLE omnichat_call_sessions
    DROP CONSTRAINT IF EXISTS omnichat_call_sessions_provider_check;

ALTER TABLE omnichat_call_sessions
    ADD CONSTRAINT omnichat_call_sessions_provider_check
    CHECK (provider IS NULL OR provider IN ('tavus'));

ALTER TABLE omnichat_persona_voices
    ADD COLUMN IF NOT EXISTS live_video_replica_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS live_video_persona_id VARCHAR(128);

ALTER TABLE omnichat_persona_voices
    DROP CONSTRAINT IF EXISTS omnichat_persona_voice_live_video_pair,
    ADD CONSTRAINT omnichat_persona_voice_live_video_pair
    CHECK ((live_video_replica_id IS NULL) = (live_video_persona_id IS NULL));
