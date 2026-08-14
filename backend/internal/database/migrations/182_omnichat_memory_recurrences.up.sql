-- Recurrence chains for character memory.
--
-- A resident goes to the same place over and over. An agent files one memory
-- per visit, so a character left running accumulates hundreds of near-identical
-- episodes: "Wandered the main stage in OmniRave", again and again.
--
-- Two easy answers are both wrong. Recording only the distinctive visits would
-- leave a character that went a thousand times remembering fifty, which
-- falsifies its history -- the one thing this design exists to avoid. Replacing
-- the episodes with a counter would throw the history away for a number: the
-- visits really happened, and volume is not noise.
--
-- So every visit is recorded, and each one names the recurring thing it is
-- another instance of. Recall then collapses the chain and surfaces the most
-- recent, exactly as it does for a retelling, and reports how many there were.
-- That is what lets a character say it goes there most nights rather than once.
--
-- This is a sibling of retells_episode_id, deliberately not a reuse of it.
-- A retelling is the same event narrated again, drifting in the telling; a
-- recurrence is a different event that resembles an earlier one. The two
-- degrade differently over time, and one column meaning both would blur "I told
-- you this before" into "this happened again".

ALTER TABLE omnichat_memory_episodes
    ADD COLUMN IF NOT EXISTS recurs_episode_id BIGINT;

-- Like a retelling chain, a recurrence chain is one level deep by construction:
-- every occurrence points at the first one, never at the occurrence before it,
-- so collapsing stays a single COALESCE rather than a recursive walk down a
-- thousand visits on the recall path. Which visit came after which is still
-- recoverable -- recorded_at orders the chain -- so nothing is lost by not
-- storing the immediate predecessor.
COMMENT ON COLUMN omnichat_memory_episodes.recurs_episode_id IS
    'The first occurrence of the recurring thing this episode is another instance of. NULL means this is the first, or a one-off. Points at a root, never at another recurrence.';

ALTER TABLE omnichat_memory_episodes
    ADD CONSTRAINT omnichat_memory_episodes_no_self_recurrence
        CHECK (recurs_episode_id IS NULL OR recurs_episode_id <> id);

-- An episode cannot be both. Claiming to be a retelling of one memory and a
-- recurrence of another says two contradictory things about what it is, and it
-- would leave the collapse key ambiguous about which chain the row belongs to.
ALTER TABLE omnichat_memory_episodes
    ADD CONSTRAINT omnichat_memory_episodes_retells_or_recurs
        CHECK (retells_episode_id IS NULL OR recurs_episode_id IS NULL);

-- memory_tier restates the tier as a value that is never NULL: a user's id for
-- relational memory, 0 for the self tier. It exists so the tier can be carried
-- into a foreign key, which a nullable owner cannot be -- a composite key
-- containing a NULL is simply not checked, so half of the rule would be
-- unenforced and the self-tier half is the half that matters. It is the same
-- COALESCE the entity identity index already uses to mean the same thing.
ALTER TABLE omnichat_memory_episodes
    ADD COLUMN IF NOT EXISTS memory_tier INTEGER
        GENERATED ALWAYS AS (COALESCE(owner_user_id, 0)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_omnichat_memory_episodes_identity_tier
    ON omnichat_memory_episodes (id, persona_id, memory_tier);

-- A recurrence link may not leave the character or the tier it was written in.
-- Crossing tiers would be a path between them: a relational episode naming a
-- self-tier one, or the reverse, is exactly the contamination the tier check
-- was added to make impossible, and a rule that only code honours is a rule
-- one future caller deletes. id is already unique on its own, so persona and
-- tier here constrain rather than identify.
--
-- No ON DELETE action, which is to say NO ACTION: nothing deletes a single
-- episode: they go with their persona or with their user, and both of those
-- take the whole chain in the same statement. A SET NULL would have to null the
-- generated column too, and a CASCADE would let deleting the first visit erase
-- the nine hundred that followed it.
ALTER TABLE omnichat_memory_episodes
    ADD CONSTRAINT omnichat_memory_episodes_recurrence_stays_in_tier
        FOREIGN KEY (recurs_episode_id, persona_id, memory_tier)
        REFERENCES omnichat_memory_episodes (id, persona_id, memory_tier);

-- Recall groups by COALESCE(retells_episode_id, recurs_episode_id, id), so the
-- collapse key needs to be reachable without scanning the table.
CREATE INDEX IF NOT EXISTS idx_omnichat_memory_episodes_recurs
    ON omnichat_memory_episodes (recurs_episode_id)
    WHERE recurs_episode_id IS NOT NULL;

-- Recording a world event first asks whether this character has already done
-- this thing, keyed on the title and answered newest-first. Without this index
-- that question costs a scan of the character's whole life, and it is asked on
-- every single visit.
CREATE INDEX IF NOT EXISTS idx_omnichat_memory_episodes_self_recurring_title
    ON omnichat_memory_episodes (persona_id, lower(btrim(title)), recorded_at DESC)
    WHERE owner_user_id IS NULL AND status = 'active';
