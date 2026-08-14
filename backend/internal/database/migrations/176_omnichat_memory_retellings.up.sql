-- Retelling chains for character memory.
--
-- A story is not fixed by the event it came from. People retell it, and over
-- years the told version drifts from what happened: details migrate, someone
-- who was not there acquires a part, the ending sharpens. That drift is real
-- information about a relationship, not noise to be collapsed away.
--
-- So a retelling is stored as its own episode pointing back at the one it
-- retells, rather than as a counter bumped on the original. The root keeps the
-- account as first recorded and is never rewritten; each telling keeps how it
-- was told that time. Reading down a chain shows the story moving.
--
-- This is the same layering the memory design already relies on elsewhere:
-- evidence stays put, understanding accumulates beside it, and provenance
-- survives both.
--
-- Recall collapses a chain to a single candidate -- twenty tellings must not
-- occupy all six recall slots -- and prefers the newest, because that is the
-- version currently in circulation between these two. The original stays
-- readable in the memories panel and in the data export.

ALTER TABLE omnichat_memory_episodes
    ADD COLUMN IF NOT EXISTS retells_episode_id BIGINT
        REFERENCES omnichat_memory_episodes(id) ON DELETE SET NULL;

-- A chain is one level deep by construction: a retelling always points at the
-- root, never at another retelling, so collapsing is a single COALESCE rather
-- than a recursive walk. The extractor is given roots only, which is what keeps
-- that true.
COMMENT ON COLUMN omnichat_memory_episodes.retells_episode_id IS
    'The episode this one retells. NULL means this is an original account. Points at a root, never at another retelling.';

ALTER TABLE omnichat_memory_episodes
    ADD CONSTRAINT omnichat_memory_episodes_no_self_retell
        CHECK (retells_episode_id IS NULL OR retells_episode_id <> id);

-- Recall groups by COALESCE(retells_episode_id, id), so the collapse key needs
-- to be reachable without scanning the table.
CREATE INDEX IF NOT EXISTS idx_omnichat_memory_episodes_retells
    ON omnichat_memory_episodes (retells_episode_id)
    WHERE retells_episode_id IS NOT NULL;
