-- Anything left on the retired profile has to land somewhere the old
-- constraint accepts, or the constraint cannot be re-added. natural_dialogue
-- is the closest surviving profile: conversational, no narration budget.
UPDATE bot_personas
SET response_style_profile = 'natural_dialogue',
    updated_at = CURRENT_TIMESTAMP
WHERE response_style_profile = 'direct_message';

ALTER TABLE bot_personas
  DROP CONSTRAINT IF EXISTS bot_personas_response_style_profile_check;

ALTER TABLE bot_personas
  ADD CONSTRAINT bot_personas_response_style_profile_check
  CHECK (response_style_profile IN (
    'inherit',
    'natural_dialogue',
    'lean_narrative',
    'professional',
    'character_only'
  ));
