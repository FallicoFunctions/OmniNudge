-- Replace the pre-launch provider marker with the self-hosted LiveKit/RunPod
-- lifecycle. Any pre-launch legacy rows are detached before tightening the
-- constraint so cleanup never attempts to call a removed provider.
UPDATE omnichat_call_sessions
SET provider = NULL, provider_session_id = NULL
WHERE provider IS NOT NULL AND provider <> 'runpod_livekit';

ALTER TABLE omnichat_call_sessions
    DROP CONSTRAINT IF EXISTS omnichat_call_sessions_provider_check;

ALTER TABLE omnichat_call_sessions
    ADD CONSTRAINT omnichat_call_sessions_provider_check
    CHECK (provider IS NULL OR provider IN ('runpod_livekit'));

ALTER TABLE omnichat_persona_voices
    DROP CONSTRAINT IF EXISTS omnichat_persona_voice_live_video_pair,
    DROP COLUMN IF EXISTS live_video_replica_id,
    DROP COLUMN IF EXISTS live_video_persona_id;
