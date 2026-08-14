DROP INDEX IF EXISTS idx_omnichat_call_sessions_provider_session;
ALTER TABLE omnichat_call_sessions
    DROP COLUMN IF EXISTS provider_session_id,
    DROP COLUMN IF EXISTS provider;
ALTER TABLE omnichat_persona_voices
    DROP CONSTRAINT IF EXISTS omnichat_persona_voice_live_video_pair,
    DROP COLUMN IF EXISTS live_video_persona_id,
    DROP COLUMN IF EXISTS live_video_replica_id;
