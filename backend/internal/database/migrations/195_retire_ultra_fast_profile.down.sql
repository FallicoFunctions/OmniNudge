-- Widen the constraints again so 'ultra_fast' is storable.
--
-- Nothing is restored to it. The rows that held it were moved to premium_deep
-- on the way up and there is no record of which those were, so putting the
-- value back on the way down would be inventing a preference somebody never
-- expressed.
ALTER TABLE omnichat_model_preferences
    DROP CONSTRAINT IF EXISTS omnichat_model_preferences_default_model_key_check;
ALTER TABLE omnichat_model_preferences
    ADD CONSTRAINT omnichat_model_preferences_default_model_key_check
        CHECK (default_model_key IN ('standard', 'plus', 'premium_quick', 'premium_deep', 'ultra_fast'));

ALTER TABLE bot_conversations
    DROP CONSTRAINT IF EXISTS bot_conversations_model_override_key_check;
ALTER TABLE bot_conversations
    ADD CONSTRAINT bot_conversations_model_override_key_check
        CHECK (model_override_key IS NULL OR model_override_key IN ('standard', 'plus', 'premium_quick', 'premium_deep', 'ultra_fast'));
