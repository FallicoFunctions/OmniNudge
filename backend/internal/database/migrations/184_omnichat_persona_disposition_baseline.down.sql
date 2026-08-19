ALTER TABLE bot_personas
    DROP CONSTRAINT IF EXISTS bot_personas_baseline_all_or_nothing;

ALTER TABLE bot_personas
    DROP COLUMN IF EXISTS baseline_mood,
    DROP COLUMN IF EXISTS baseline_trust,
    DROP COLUMN IF EXISTS baseline_warmth;
