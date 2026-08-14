ALTER TABLE omnichat_persona_voices
    DROP CONSTRAINT IF EXISTS omnichat_persona_voices_provider_check;

ALTER TABLE omnichat_persona_voices
    ADD CONSTRAINT omnichat_persona_voices_provider_check
    CHECK (provider IN ('browser', 'elevenlabs', 'voicebox'));

ALTER TABLE omnichat_speech_audio
    DROP CONSTRAINT IF EXISTS omnichat_speech_audio_file_size_check;

ALTER TABLE omnichat_speech_audio
    ADD CONSTRAINT omnichat_speech_audio_file_size_check
    CHECK (file_size BETWEEN 1 AND 26214400);
