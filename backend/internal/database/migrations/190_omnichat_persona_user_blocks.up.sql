-- Give a character a way to stop talking to someone.
--
-- The mirror of omnirave_persona_sanctions: same shape, opposite direction --
-- a decision by a character about a person, rather than by the platform about a
-- character. It reads like that table on purpose, so whoever knows one knows
-- this one.
--
-- The ladder escalates with repetition: 10 minutes, 2 hours, a day, then
-- indefinitely. The rung is stored rather than inferred from the duration,
-- because escalation asks how far up someone already is and reading that back
-- out of an interval would be guesswork once any duration is ever tuned.
--
-- This table holds the decision, not the judgment. Who decides is a separate
-- problem and a harder one; every column here is written the same way whether
-- the block came from a model, an operator, or a test.

CREATE TABLE IF NOT EXISTS omnichat_persona_user_blocks (
    id BIGSERIAL PRIMARY KEY,

    -- A deleted character takes its blocks with it, and so does a deleted
    -- person: a block on somebody who no longer exists is a record of a
    -- decision nobody can act on.
    persona_id BIGINT NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 1 = 10 minutes, 2 = 2 hours, 3 = a day, 4 = indefinite.
    tier SMALLINT NOT NULL,

    -- NULL means indefinite, as in omnirave_persona_sanctions.
    expires_at TIMESTAMPTZ,

    -- Not nullable. The spec requires every block to record why, because the
    -- admin review exists to judge whether the reason was fair, and a block
    -- with no reason cannot be reviewed -- only guessed at.
    reason TEXT NOT NULL,

    -- An overturned block stops being in force but is never deleted. The
    -- history is the point: it is what an admin reviews, and what tells anyone
    -- later that a decision was made and reversed rather than never made.
    overturned_at TIMESTAMPTZ,
    overturned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    overturn_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE omnichat_persona_user_blocks
    DROP CONSTRAINT IF EXISTS omnichat_persona_user_blocks_tier_check;
ALTER TABLE omnichat_persona_user_blocks
    ADD CONSTRAINT omnichat_persona_user_blocks_tier_check
        CHECK (tier BETWEEN 1 AND 4);

-- 181's lesson, one table over. A row that looks like a decision but expired on
-- arrival is worse than no row at all, because it is the one nobody goes back
-- to check. The top rung is indefinite by nature and must not carry an expiry;
-- every rung below it is defined by lapsing and must have one.
ALTER TABLE omnichat_persona_user_blocks
    DROP CONSTRAINT IF EXISTS omnichat_persona_user_blocks_expiry_matches_tier_check;
ALTER TABLE omnichat_persona_user_blocks
    ADD CONSTRAINT omnichat_persona_user_blocks_expiry_matches_tier_check
        CHECK (
            (tier = 4 AND expires_at IS NULL)
            OR (tier < 4 AND expires_at IS NOT NULL)
        );

-- An overturn is one act: the time it happened and who did it travel together,
-- or the record cannot answer the question the review exists to ask.
ALTER TABLE omnichat_persona_user_blocks
    DROP CONSTRAINT IF EXISTS omnichat_persona_user_blocks_overturn_is_whole_check;
ALTER TABLE omnichat_persona_user_blocks
    ADD CONSTRAINT omnichat_persona_user_blocks_overturn_is_whole_check
        CHECK (
            (overturned_at IS NULL AND overturned_by IS NULL AND overturn_note IS NULL)
            OR (overturned_at IS NOT NULL AND overturned_by IS NOT NULL)
        );

-- Serves the question asked on every single message: is this person blocked by
-- this character right now. now() is not immutable so the time test cannot live
-- in the predicate; carrying expires_at in the index lets it answer anyway.
CREATE INDEX IF NOT EXISTS idx_omnichat_persona_user_blocks_active
    ON omnichat_persona_user_blocks (persona_id, user_id, expires_at)
    WHERE overturned_at IS NULL;

-- Serves the admin review queue: what has this character done lately.
CREATE INDEX IF NOT EXISTS idx_omnichat_persona_user_blocks_review
    ON omnichat_persona_user_blocks (created_at DESC);
