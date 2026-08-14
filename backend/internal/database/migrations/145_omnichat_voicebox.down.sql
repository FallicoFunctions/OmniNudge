UPDATE omnichat_persona_voices
SET provider = 'browser',
    voice_id = 'browser-' || persona_id,
    voice_name = 'Character voice',
    model_id = 'browser-native',
    updated_at = NOW()
WHERE provider = 'voicebox';

ALTER TABLE omnichat_persona_voices
    DROP CONSTRAINT IF EXISTS omnichat_persona_voices_provider_check;

ALTER TABLE omnichat_persona_voices
    ADD CONSTRAINT omnichat_persona_voices_provider_check
    CHECK (provider IN ('browser', 'elevenlabs'));

DELETE FROM omnichat_speech_audio WHERE file_size > 10485760;

ALTER TABLE omnichat_speech_audio
    DROP CONSTRAINT IF EXISTS omnichat_speech_audio_file_size_check;

ALTER TABLE omnichat_speech_audio
    ADD CONSTRAINT omnichat_speech_audio_file_size_check
    CHECK (file_size BETWEEN 1 AND 10485760);
