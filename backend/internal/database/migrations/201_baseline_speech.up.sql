-- Two more dimensions: how much she says, and how much feeling is in it.
--
-- Neither had anywhere to live. A character written as quiet was being recorded
-- as low warmth and mild firmness, which does not make her quiet -- it makes her
-- cold and stubborn. Those are different people, and the form was offering the
-- word while the model stored something else.
--
-- Two columns rather than one, because the two words are genuinely different in
-- text. Quiet is length: two words where there could be forty. Reserved is
-- colour: a long, careful, exact message with almost no feeling showing in it.
-- One number can say "less comes out of her" and cannot say "many words, little
-- feeling".
--
-- Unlike firmness, these are NOT fixed. Firmness is deliberately the exception
-- -- whether she can be worn down is who she is. How much somebody talks is not
-- a property of them at all; it is a property of them and whoever they are
-- talking to. The same person is silent in a lecture and unstoppable in a
-- message to someone they love, on the same day. So these are a starting point
-- that closeness opens, which is how warmth and trust already behave, and a
-- character who stayed terse after four hundred conversations would not be a
-- quiet person but a broken one.
ALTER TABLE bot_personas
    ADD COLUMN baseline_talkativeness REAL
        CHECK (baseline_talkativeness >= -1 AND baseline_talkativeness <= 1);
ALTER TABLE bot_personas
    ADD COLUMN baseline_expressiveness REAL
        CHECK (baseline_expressiveness >= -1 AND baseline_expressiveness <= 1);

-- Cleared rather than backfilled, for the reason 193 gave when it added the
-- fourth: writing 0 would record a judgement about how much each character
-- talks that nobody ever made, and a fabricated reading is worse than an absent
-- one because nothing later marks it as suspect.
--
-- The cost is one command:  go run ./cmd/derive_omnichat_baselines -force
UPDATE bot_personas
SET baseline_mood = NULL,
    baseline_trust = NULL,
    baseline_warmth = NULL,
    baseline_firmness = NULL
WHERE baseline_mood IS NOT NULL;

ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_baseline_all_or_nothing;
ALTER TABLE bot_personas
    ADD CONSTRAINT bot_personas_baseline_all_or_nothing CHECK (
        (baseline_mood IS NULL AND baseline_trust IS NULL
            AND baseline_warmth IS NULL AND baseline_firmness IS NULL
            AND baseline_talkativeness IS NULL AND baseline_expressiveness IS NULL)
        OR (baseline_mood IS NOT NULL AND baseline_trust IS NOT NULL
            AND baseline_warmth IS NOT NULL AND baseline_firmness IS NOT NULL
            AND baseline_talkativeness IS NOT NULL AND baseline_expressiveness IS NOT NULL)
    );
