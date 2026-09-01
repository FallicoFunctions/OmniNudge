-- Back to 188's narrower rule: refuse only the direction that would strand
-- conversation-derived shared episodes, and only while some exist.
CREATE OR REPLACE FUNCTION bot_personas_enforce_memory_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    shared_episodes BIGINT;
BEGIN
    IF OLD.response_style_profile = 'direct_message'
       AND NEW.response_style_profile <> 'direct_message' THEN
        SELECT count(*) INTO shared_episodes
        FROM omnichat_memory_episodes e
        WHERE e.persona_id = NEW.id
          AND e.owner_user_id IS NULL
          AND e.conversation_id IS NOT NULL;

        IF shared_episodes > 0 THEN
            RAISE EXCEPTION
                'omnichat memory: persona % holds % conversation-derived shared episodes and cannot leave the OmniAI profile while they exist',
                NEW.id, shared_episodes
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
