-- A character who is not playing a part. There is no scene, no scenario, and
-- no narration to mark up -- two people typing at each other, both aware of
-- it. Every existing profile assumes a performance of some kind, so this is a
-- new one rather than a variation on lean_narrative.
ALTER TABLE bot_personas
  DROP CONSTRAINT IF EXISTS bot_personas_response_style_profile_check;

ALTER TABLE bot_personas
  ADD CONSTRAINT bot_personas_response_style_profile_check
  CHECK (response_style_profile IN (
    'inherit',
    'natural_dialogue',
    'lean_narrative',
    'professional',
    'character_only',
    'direct_message'
  ));
