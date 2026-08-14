DROP INDEX IF EXISTS idx_omnichat_memory_episodes_self_recurring_title;
DROP INDEX IF EXISTS idx_omnichat_memory_episodes_recurs;
ALTER TABLE omnichat_memory_episodes
    DROP CONSTRAINT IF EXISTS omnichat_memory_episodes_recurrence_stays_in_tier;
DROP INDEX IF EXISTS idx_omnichat_memory_episodes_identity_tier;
ALTER TABLE omnichat_memory_episodes
    DROP CONSTRAINT IF EXISTS omnichat_memory_episodes_retells_or_recurs;
ALTER TABLE omnichat_memory_episodes
    DROP CONSTRAINT IF EXISTS omnichat_memory_episodes_no_self_recurrence;
ALTER TABLE omnichat_memory_episodes
    DROP COLUMN IF EXISTS memory_tier;
ALTER TABLE omnichat_memory_episodes
    DROP COLUMN IF EXISTS recurs_episode_id;
