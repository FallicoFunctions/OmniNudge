-- Sadie's guarantee is that nothing said in a conversation can ever become
-- persona-global. A free character requires the opposite: her memory is whole,
-- so what one person tells her, another may hear. Both have to be true at once,
-- per character, and the schema has to be the thing that says which.
--
-- The old guarantee was a CHECK, which cannot ask about the persona, because a
-- CHECK may not contain a subquery. A trigger can, and keeps the rule in the
-- database rather than relocating it into application code where the next
-- caller can forget it.

CREATE OR REPLACE FUNCTION omnichat_memory_episodes_enforce_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Relational: owned by exactly one person. Always allowed.
    IF NEW.owner_user_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Self tier, not derived from anyone's conversation -- a character's own
    -- life, which the nursery writes. Always allowed.
    IF NEW.conversation_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Conversation-derived and persona-global. Allowed only for a character
    -- whose whole point is that she remembers across everyone.
    IF EXISTS (
        SELECT 1 FROM bot_personas p
        WHERE p.id = NEW.persona_id
          AND p.response_style_profile = 'direct_message'
    ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'omnichat memory: conversation-derived episode may not be persona-global for persona % (tier violation)',
        NEW.persona_id
        USING ERRCODE = 'check_violation';
END;
$$;

ALTER TABLE omnichat_memory_episodes
    DROP CONSTRAINT IF EXISTS omnichat_memory_episodes_tier_check;

-- Dropped first, the way 068, 071, 073 and 077 already do it. The
-- functions above use CREATE OR REPLACE and are re-runnable; these were
-- plain CREATEs, so a migration that failed after creating one could
-- never be run again -- the second attempt died on the trigger the first
-- attempt had left behind.
DROP TRIGGER IF EXISTS omnichat_memory_episodes_tier_guard ON omnichat_memory_episodes;
CREATE TRIGGER omnichat_memory_episodes_tier_guard
    BEFORE INSERT OR UPDATE OF owner_user_id, conversation_id, persona_id
    ON omnichat_memory_episodes
    FOR EACH ROW
    EXECUTE FUNCTION omnichat_memory_episodes_enforce_tier();

-- Guarding the write is not enough on its own. The permission is read off the
-- persona, so moving a character off the free profile would leave her existing
-- shared memories sitting in a tier that is no longer allowed to hold them --
-- the guarantee would be one UPDATE away from being false, which is precisely
-- what putting it in the database was meant to prevent.
--
-- There is no safe automatic repair. Those episodes came from several people's
-- conversations at once, so they cannot be handed to an owner, and silently
-- deleting them would destroy the character's history on a settings change.
-- Refuse instead, and make the caller decide.
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
                'omnichat memory: persona % holds % conversation-derived shared episodes and cannot leave the free profile while they exist',
                NEW.id, shared_episodes
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Dropped first, the way 068, 071, 073 and 077 already do it. The
-- functions above use CREATE OR REPLACE and are re-runnable; these were
-- plain CREATEs, so a migration that failed after creating one could
-- never be run again -- the second attempt died on the trigger the first
-- attempt had left behind.
DROP TRIGGER IF EXISTS bot_personas_memory_tier_change_guard ON bot_personas;
CREATE TRIGGER bot_personas_memory_tier_change_guard
    BEFORE UPDATE OF response_style_profile
    ON bot_personas
    FOR EACH ROW
    EXECUTE FUNCTION bot_personas_enforce_memory_tier_change();
