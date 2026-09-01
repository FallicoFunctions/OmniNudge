-- A character is roleplay or an OmniAI, chosen when she is created, and that
-- category is never changed afterwards.
--
-- 188 refused only the direction that would strand shared memories, and only
-- while some existed. That was too narrow. The kind is not a setting; it decides
-- whether a backstory is a rule she follows or merely where she started, whether
-- there is a scene to render, whether she greets anyone, and whether her memory
-- is hers or the relationship's. Flipping it turns her into a different
-- character wearing the same name and history.
--
-- Neither direction is allowed, with or without memories to protect. A change of
-- kind is a new character.

CREATE OR REPLACE FUNCTION bot_personas_enforce_memory_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (OLD.response_style_profile = 'direct_message')
       IS DISTINCT FROM
       (NEW.response_style_profile = 'direct_message') THEN
        RAISE EXCEPTION
            'omnichat: persona % cannot change between OmniAI and roleplay; the kind is fixed at creation',
            NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
