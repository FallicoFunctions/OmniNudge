-- Restoring the CHECK means any conversation-derived global episode written
-- while the trigger allowed it has to go. There is nowhere else to put it:
-- attaching it to one user would invent an owner it never had, and that owner
-- would then be able to read, export, and delete something several other
-- people also said.
DROP TRIGGER IF EXISTS bot_personas_memory_tier_change_guard ON bot_personas;
DROP FUNCTION IF EXISTS bot_personas_enforce_memory_tier_change();

DROP TRIGGER IF EXISTS omnichat_memory_episodes_tier_guard ON omnichat_memory_episodes;
DROP FUNCTION IF EXISTS omnichat_memory_episodes_enforce_tier();

DELETE FROM omnichat_memory_episodes
WHERE owner_user_id IS NULL AND conversation_id IS NOT NULL;

ALTER TABLE omnichat_memory_episodes
    ADD CONSTRAINT omnichat_memory_episodes_tier_check
        CHECK (owner_user_id IS NOT NULL OR conversation_id IS NULL);
