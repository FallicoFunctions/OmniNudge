-- A voice call on Gemini Live claims its session row for the one socket that
-- carries it, so a second socket for the same call cannot open a second Live
-- session on the platform's key.
ALTER TABLE omnichat_call_sessions
    DROP CONSTRAINT IF EXISTS omnichat_call_sessions_provider_check;

ALTER TABLE omnichat_call_sessions
    ADD CONSTRAINT omnichat_call_sessions_provider_check
    CHECK (provider IS NULL OR provider IN ('runpod_livekit', 'gemini_live'));
