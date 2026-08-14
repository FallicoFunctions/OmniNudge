DELETE FROM omnichat_persona_voices v
USING bot_personas p
WHERE v.persona_id = p.id
  AND v.configured_by IS NULL
  AND v.provider = 'voicebox'
  AND v.model_id = 'kokoro'
  AND (p.slug, v.voice_id) IN (
      ('pirate-story-narrator', 'bm_george'),
      ('high-school-story-narrator', 'af_sarah'),
      ('ruleskeeper-dm', 'am_adam'),
      ('malachar-warlock-dm', 'am_onyx'),
      ('ella-morgan', 'af_bella'),
      ('scarlett-voss', 'af_nova'),
      ('pink-sadie', 'af_heart'),
      ('rhett-callahan', 'am_liam'),
      ('max-rosen', 'am_echo'),
      ('dr-harold-whitcomb', 'am_eric')
  );
