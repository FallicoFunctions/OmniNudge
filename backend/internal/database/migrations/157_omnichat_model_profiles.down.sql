ALTER TABLE omnichat_model_preferences
    DROP CONSTRAINT omnichat_model_preferences_key_check;

ALTER TABLE bot_conversations
    DROP CONSTRAINT bot_conversations_model_override_key_check;

UPDATE omnichat_model_preferences
SET default_model_key = CASE default_model_key
    WHEN 'standard' THEN 'free'
    WHEN 'premium_quick' THEN 'premium'
    WHEN 'premium_deep' THEN 'premium'
    WHEN 'ultra_fast' THEN 'premium'
    ELSE default_model_key
END;

UPDATE bot_conversations
SET model_override_key = CASE model_override_key
    WHEN 'standard' THEN 'free'
    WHEN 'premium_quick' THEN 'premium'
    WHEN 'premium_deep' THEN 'premium'
    WHEN 'ultra_fast' THEN 'premium'
    ELSE model_override_key
END
WHERE model_override_key IN ('standard', 'premium_quick', 'premium_deep', 'ultra_fast');

ALTER TABLE omnichat_model_preferences
    ALTER COLUMN default_model_key SET DEFAULT 'free',
    ADD CONSTRAINT omnichat_model_preferences_key_check
        CHECK (default_model_key IN ('free', 'plus', 'premium'));

ALTER TABLE bot_conversations
    ADD CONSTRAINT bot_conversations_model_override_key_check
        CHECK (model_override_key IS NULL OR model_override_key IN ('free', 'plus', 'premium'));
