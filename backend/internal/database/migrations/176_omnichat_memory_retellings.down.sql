DROP INDEX IF EXISTS idx_omnichat_memory_episodes_retells;
ALTER TABLE omnichat_memory_episodes
    DROP CONSTRAINT IF EXISTS omnichat_memory_episodes_no_self_retell;
ALTER TABLE omnichat_memory_episodes
    DROP COLUMN IF EXISTS retells_episode_id;
