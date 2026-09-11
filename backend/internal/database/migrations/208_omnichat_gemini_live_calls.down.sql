UPDATE omnichat_call_sessions
SET provider = NULL, provider_session_id = NULL
WHERE provider = 'gemini_live';

ALTER TABLE omnichat_call_sessions
    DROP CONSTRAINT IF EXISTS omnichat_call_sessions_provider_check;

ALTER TABLE omnichat_call_sessions
    ADD CONSTRAINT omnichat_call_sessions_provider_check
    CHECK (provider IS NULL OR provider IN ('runpod_livekit'));
