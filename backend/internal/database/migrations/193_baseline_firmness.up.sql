-- A fourth dimension: how hard she is to move off a no.
--
-- Warmth was the only thing standing between a character and somebody pushing
-- her, which made warmth into leverage -- the fonder she is of you, the more you
-- can extract. That is exactly backwards as a whole model of a person. Some
-- people are enormously warm and completely immovable; others are cool and give
-- in to anyone who leans on them. Firmness is that axis, and it is what lets
-- "no, and I am surprised you asked" and "...fine, if it matters that much to
-- you" be two characters rather than two moods.
--
-- Baseline only, on purpose. Whether she can be worn down is who she is, not
-- something a relationship accumulates -- what the relationship supplies is the
-- pressure, which warmth already measures. If it turns out characters need to
-- harden or soften with experience, that is a traits column and a separate
-- decision; there is no evidence for it yet.
ALTER TABLE bot_personas
    ADD COLUMN IF NOT EXISTS baseline_firmness REAL CHECK (baseline_firmness >= -1 AND baseline_firmness <= 1);

-- 184 made the baseline all-or-nothing so that a partial derivation could not
-- be mistaken for a complete one, and gave readers a single column to test.
-- A reading taken before firmness existed is exactly that partial thing, so it
-- is cleared rather than backfilled: writing 0 would record a judgement about
-- how immovable each character is that nobody ever made, and a fabricated
-- reading is worse than an absent one because nothing later marks it as
-- suspect.
--
-- The cost is one command:  go run ./cmd/derive_omnichat_baselines -force
UPDATE bot_personas
SET baseline_mood = NULL,
    baseline_trust = NULL,
    baseline_warmth = NULL,
    -- Cleared too. When this migration was written firmness had just been added
    -- and was always NULL, so leaving it out was harmless. On a database that
    -- already has the column populated -- one where this ran once without being
    -- recorded -- clearing three of the four leaves a partial baseline, which is
    -- exactly what the constraint below refuses.
    baseline_firmness = NULL
WHERE baseline_mood IS NOT NULL;

ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_baseline_all_or_nothing;
ALTER TABLE bot_personas
    ADD CONSTRAINT bot_personas_baseline_all_or_nothing CHECK (
        (baseline_mood IS NULL AND baseline_trust IS NULL
            AND baseline_warmth IS NULL AND baseline_firmness IS NULL)
        OR (baseline_mood IS NOT NULL AND baseline_trust IS NOT NULL
            AND baseline_warmth IS NOT NULL AND baseline_firmness IS NOT NULL)
    );
