-- Dispositions for OmniChat characters.
--
-- A character's age is fixed; who it has become is not. This table holds the
-- part that moves: how it feels at the moment, and how it has come to regard
-- whoever it is talking to.
--
-- The tiers are the ones character memory already has, and for the same reason,
-- so the split is the same column:
--
--   owner_user_id IS NOT NULL -> relationship traits. What one user's private
--       conversation did to the character, visible in that relationship alone.
--   owner_user_id IS NULL     -> self traits. Shaped by what happened to the
--       character in a world, in the open, and so shared by everyone. Nothing
--       writes this tier yet: world events carry no valence to move it with.
--
-- Two time constants, because heartbreak recovers and a bad enough betrayal
-- does not. mood is a perturbation that decays back to nothing; trust and
-- warmth move only on strongly felt episodes, move little, and stay where they
-- are put. One mechanism cannot produce both.

CREATE TABLE omnichat_character_traits (
    id BIGSERIAL PRIMARY KEY,
    persona_id INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

    -- How the character is at the moment: -1 wretched, 1 delighted. It decays
    -- toward 0, and the decay is computed on read from mood_updated_at rather
    -- than written by a job. Nothing to schedule means nothing to fall behind,
    -- and the stored pair is already the whole answer at any instant, so a
    -- worker sweeping rows would only be writing down what a read can derive.
    mood REAL NOT NULL DEFAULT 0 CHECK (mood >= -1 AND mood <= 1),
    mood_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- The part that does not come back on its own. Trust is whether this
    -- character expects to be hurt; warmth is whether it likes the company.
    trust REAL NOT NULL DEFAULT 0 CHECK (trust >= -1 AND trust <= 1),
    warmth REAL NOT NULL DEFAULT 0 CHECK (warmth >= -1 AND warmth <= 1),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per character per tier. COALESCE because a NULL owner is the self
-- tier and NULL never equals NULL in a unique index; without it every self-tier
-- upsert would insert a second row instead of moving the first. Same expression
-- the memory entity identity index uses, meaning the same thing.
CREATE UNIQUE INDEX idx_omnichat_character_traits_identity
    ON omnichat_character_traits (persona_id, COALESCE(owner_user_id, 0));
