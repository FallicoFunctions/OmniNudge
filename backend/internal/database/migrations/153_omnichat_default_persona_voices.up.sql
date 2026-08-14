-- Give the ten built-in OmniChat characters distinct temporary Kokoro voices.
-- Existing administrator or owner assignments always win.
WITH defaults(slug, voice_id, voice_name) AS (
    VALUES
        ('pirate-story-narrator', 'bm_george', 'George'),
        ('high-school-story-narrator', 'af_sarah', 'Sarah'),
        ('ruleskeeper-dm', 'am_adam', 'Adam'),
        ('malachar-warlock-dm', 'am_onyx', 'Onyx'),
        ('ella-morgan', 'af_bella', 'Bella'),
        ('scarlett-voss', 'af_nova', 'Nova'),
        ('pink-sadie', 'af_heart', 'Heart'),
        ('rhett-callahan', 'am_liam', 'Liam'),
        ('max-rosen', 'am_echo', 'Echo'),
        ('dr-harold-whitcomb', 'am_eric', 'Eric')
)
INSERT INTO omnichat_persona_voices (
    persona_id, provider, voice_id, voice_name, model_id,
    stability, similarity_boost, style, speed, pitch, language_code,
    configured_by, active
)
SELECT
    p.id, 'voicebox', d.voice_id, d.voice_name, 'kokoro',
    0.5, 0.75, 0, 1, 1, 'en',
    NULL, TRUE
FROM defaults d
JOIN bot_personas p ON p.slug = d.slug AND p.owner_user_id IS NULL
ON CONFLICT (persona_id) DO NOTHING;
