-- Restoring 186's constraint means any privately owned direct-message persona
-- created since must go somewhere it accepts.
UPDATE bot_personas
SET response_style_profile = 'natural_dialogue',
    updated_at = CURRENT_TIMESTAMP
WHERE response_style_profile = 'direct_message'
  AND owner_user_id IS NOT NULL;

ALTER TABLE bot_personas
  ADD CONSTRAINT bot_personas_direct_message_is_platform_owned
  CHECK (response_style_profile <> 'direct_message' OR owner_user_id IS NULL);
