-- Retire the ultra_fast profile.
--
-- It was the one offer that bought a different model -- Opus, behind
-- OmniCredits -- and it was defended on the grounds that buying it was a
-- choice. That defence did not survive inspection: it fell back to a different
-- model whenever Opus was unavailable, and permanently once credits ran out, so
-- the swap was neither announced nor voluntary. Somebody who had talked to a
-- character for a month would simply have found her replaced by someone else
-- carrying her memories.
--
-- Every tier now names the same model. A tier buys volume, features, and how
-- hard she thinks. Credits pay for image and video generation, at every tier,
-- which is where the cost actually is.
--
-- Nothing selected it: zero rows in either column at the time of writing. The
-- UPDATEs are here for other environments rather than for this one, and they
-- come first because the CHECK cannot be narrowed while a row still holds the
-- value it forbids.
UPDATE omnichat_model_preferences
SET default_model_key = 'premium_deep'
WHERE default_model_key = 'ultra_fast';

UPDATE bot_conversations
SET model_override_key = 'premium_deep'
WHERE model_override_key = 'ultra_fast';

ALTER TABLE omnichat_model_preferences
    DROP CONSTRAINT IF EXISTS omnichat_model_preferences_default_model_key_check;
ALTER TABLE omnichat_model_preferences
    ADD CONSTRAINT omnichat_model_preferences_default_model_key_check
        CHECK (default_model_key IN ('standard', 'plus', 'premium_quick', 'premium_deep'));

ALTER TABLE bot_conversations
    DROP CONSTRAINT IF EXISTS bot_conversations_model_override_key_check;
ALTER TABLE bot_conversations
    ADD CONSTRAINT bot_conversations_model_override_key_check
        CHECK (model_override_key IS NULL OR model_override_key IN ('standard', 'plus', 'premium_quick', 'premium_deep'));
