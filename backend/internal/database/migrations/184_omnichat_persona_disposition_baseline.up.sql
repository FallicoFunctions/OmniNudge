-- A character's authored disposition: who she was written to be.
--
-- omnichat_character_traits already holds what has happened to a character
-- since. It starts at zero for everyone, which makes a character written as
-- guarded exactly as trusting, dispositionally, as one written as open -- her
-- card and her disposition disagree from birth, and the disposition wins
-- wherever it applies. These columns are the other half: the resting state the
-- card implies, derived once from the card and then left alone.
--
-- They live here, on the definition, rather than in the traits row, and that
-- separation is the whole point. Re-deriving a baseline -- a better prompt, an
-- edited card -- must not erase the life the character has accumulated, and
-- reading a traits row must never make an authored trait look like something
-- that happened to her. Effective disposition is the sum of the two, clamped.
--
-- NULL means not derived yet, and must behave exactly as a character behaved
-- before this existed: neutral. Derivation costs a model call, so most rows
-- will be NULL for a while and every read path has to be indifferent to it.
ALTER TABLE bot_personas
    ADD COLUMN baseline_mood REAL CHECK (baseline_mood >= -1 AND baseline_mood <= 1),
    ADD COLUMN baseline_trust REAL CHECK (baseline_trust >= -1 AND baseline_trust <= 1),
    ADD COLUMN baseline_warmth REAL CHECK (baseline_warmth >= -1 AND baseline_warmth <= 1);

-- The three are one reading of one card and are only ever written together, so
-- a half-derived baseline is not a state the derivation can leave behind after
-- a partial failure. It also gives every reader one column to test for
-- "derived yet?" instead of three that could disagree.
ALTER TABLE bot_personas
    ADD CONSTRAINT bot_personas_baseline_all_or_nothing CHECK (
        (baseline_mood IS NULL AND baseline_trust IS NULL AND baseline_warmth IS NULL)
        OR (baseline_mood IS NOT NULL AND baseline_trust IS NOT NULL AND baseline_warmth IS NOT NULL)
    );
