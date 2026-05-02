-- Add a display name to AI designs and backfill existing rows with "Design #N"
-- ordered by created_at within each hub.
ALTER TABLE hub_ai_designs ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

UPDATE hub_ai_designs d
SET name = 'Design #' || sub.rn
FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY hub_id ORDER BY created_at) AS rn
    FROM hub_ai_designs
) sub
WHERE d.id = sub.id AND d.name = '';
