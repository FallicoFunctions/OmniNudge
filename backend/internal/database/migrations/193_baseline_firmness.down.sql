-- Back to a three-dimension reading. Baselines derived with firmness are
-- cleared for the same reason 193 cleared the ones without it: what remains
-- would be a reading taken under different instructions, and there would be
-- nothing left to mark it as such.
UPDATE bot_personas
SET baseline_mood = NULL,
    baseline_trust = NULL,
    baseline_warmth = NULL,
    baseline_firmness = NULL
WHERE baseline_mood IS NOT NULL;

ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_baseline_all_or_nothing;

ALTER TABLE bot_personas
    DROP COLUMN IF EXISTS baseline_firmness;

ALTER TABLE bot_personas
    ADD CONSTRAINT bot_personas_baseline_all_or_nothing CHECK (
        (baseline_mood IS NULL AND baseline_trust IS NULL AND baseline_warmth IS NULL)
        OR (baseline_mood IS NOT NULL AND baseline_trust IS NOT NULL AND baseline_warmth IS NOT NULL)
    );
