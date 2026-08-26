-- Something said in a conversation that constrains what should be true later.
--
-- A bet, a dare, a promise, "I'll tell you tomorrow", "you owe me one" -- one
-- primitive wearing different clothes. It is what gives a character continuity
-- of *intent* rather than only of recall: one who remembers everything but
-- holds herself to nothing is a very good transcript.
--
-- Not an episode with extra columns. An episode records that something
-- happened, is scored for how memorable it was, and is finished the moment it
-- is written. A commitment is unfinished by definition, has two parties and a
-- direction, and is interesting precisely while nothing has happened to it yet.
-- Bolting a counterparty and a resolution onto episodes would make every
-- episode carry four columns that almost none of them use.
CREATE TABLE IF NOT EXISTS omnichat_commitments (
    id BIGSERIAL PRIMARY KEY,

    persona_id BIGINT NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,

    -- Always owned, unlike a memory episode. A memory can be a character's own;
    -- a commitment cannot, because there is always somebody on the other end of
    -- it. Even for a character whose memory is shared across everyone, what she
    -- owes is owed to one person.
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 'hers' is something she undertook. 'theirs' is something she is owed.
    -- Both are worth holding: one governs whether she is reliable, the other
    -- whether they are, and she reacts to being let down as much as to letting
    -- somebody down.
    direction TEXT NOT NULL,

    summary TEXT NOT NULL,

    -- Most commitments name no time at all. NULL means open-ended rather than
    -- overdue, and nothing should ever treat it as the latter.
    due_at TIMESTAMPTZ,

    -- open until somebody resolves it. 'released' is the case that is neither
    -- kept nor broken: the bet was called off, the favour stopped mattering,
    -- both of them forgot on purpose.
    status TEXT NOT NULL DEFAULT 'open',
    resolved_at TIMESTAMPTZ,

    -- Provenance, so a commitment she brings up can be traced to the exchange
    -- that created it rather than taken on faith.
    conversation_id INTEGER REFERENCES bot_conversations(id) ON DELETE SET NULL,
    source_message_id INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE omnichat_commitments
    DROP CONSTRAINT IF EXISTS omnichat_commitments_direction_check;
ALTER TABLE omnichat_commitments
    ADD CONSTRAINT omnichat_commitments_direction_check
        CHECK (direction IN ('hers', 'theirs'));

ALTER TABLE omnichat_commitments
    DROP CONSTRAINT IF EXISTS omnichat_commitments_status_check;
ALTER TABLE omnichat_commitments
    ADD CONSTRAINT omnichat_commitments_status_check
        CHECK (status IN ('open', 'kept', 'broken', 'released'));

-- An open commitment has not been resolved and a resolved one has a time. The
-- lesson from 181, one table further on: a row that reads as settled while
-- carrying no record of when, or as outstanding while carrying one, is a row
-- nobody can act on and nobody goes back to check.
ALTER TABLE omnichat_commitments
    DROP CONSTRAINT IF EXISTS omnichat_commitments_resolution_is_whole_check;
ALTER TABLE omnichat_commitments
    ADD CONSTRAINT omnichat_commitments_resolution_is_whole_check
        CHECK (
            (status = 'open' AND resolved_at IS NULL)
            OR (status <> 'open' AND resolved_at IS NOT NULL)
        );

-- Serves the question asked before every reply: what is outstanding between
-- these two. Partial, because settled commitments are history rather than
-- something she is carrying.
CREATE INDEX IF NOT EXISTS idx_omnichat_commitments_open
    ON omnichat_commitments (persona_id, owner_user_id, created_at DESC)
    WHERE status = 'open';
