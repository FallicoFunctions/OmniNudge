-- Give admission something to refuse.
--
-- The design says a character can be refused at the door: one that is
-- sanctioned, whose owner is deleted, or that has been withdrawn does not get
-- in. Deletion already works -- the persona row is gone and the eligibility
-- query finds nothing -- but there was nothing to refuse against for the other
-- two. Eligibility was only "exists, active, public, unowned", which are
-- properties of what a character *is*, with nowhere to record a decision
-- somebody made *about* it. omnirave_guest_sanctions cannot serve: it keys on a
-- bootstrap id and an IP hash, and a character has neither.
--
-- Only a platform character is admissible (owner_user_id IS NULL), so an
-- admissible character has no user owner. "Its owner can withdraw it" therefore
-- means the platform withdraws it, not an end user. That is why this table has
-- no user column and no user-facing write path: the write is an operator
-- action, for now SQL or admin only. What matters is that admission reads it.
--
-- There is deliberately no revocation channel for a character already in a
-- world. A world token lives five minutes, so a withdrawn character is out of
-- circulation within five minutes of the sanction landing, with no disconnect
-- mechanism at all. Recording that here is the point: it is the property that
-- makes this slice small, and anyone tempted to build live revocation should
-- know the door already closes on its own.
--
-- The shape stays close to omnirave_guest_sanctions -- id, action, expires_at,
-- created_at, NULL expiry meaning indefinite -- so the two read alike and a
-- reader who knows one knows the other.

CREATE TABLE IF NOT EXISTS omnirave_persona_sanctions (
    id BIGSERIAL PRIMARY KEY,
    -- A deleted character takes its sanctions with it. There is no such thing
    -- as a sanction on a character that no longer exists: admission already
    -- refuses it for being absent, so an orphaned row would only be a record of
    -- a decision nobody can act on.
    persona_id BIGINT NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    -- NULL means indefinite. 'withdrawn' is the indefinite case by nature; a
    -- moderation suspension usually names a time it lapses.
    expires_at TIMESTAMPTZ,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The set is closed in the database rather than trusted from a caller, for the
-- same reason the profile subject kinds are: a typo in an operator's SQL would
-- otherwise write a sanction that no reader recognises and that therefore
-- silently does nothing.
ALTER TABLE omnirave_persona_sanctions
    DROP CONSTRAINT IF EXISTS omnirave_persona_sanctions_action_check;
ALTER TABLE omnirave_persona_sanctions
    ADD CONSTRAINT omnirave_persona_sanctions_action_check
        CHECK (action IN ('withdrawn', 'suspended'));

-- Serves the only question anyone asks of this table: does this persona have a
-- sanction in force right now. now() is not immutable, so the time test cannot
-- live in a partial index predicate; carrying expires_at as the second column
-- lets the index answer it anyway.
CREATE INDEX IF NOT EXISTS idx_omnirave_persona_sanctions_active
    ON omnirave_persona_sanctions (persona_id, expires_at);
