-- The answers go with it. Nothing else holds them, so a character who survives
-- this rollback has no recorded appearance and would have to be asked again.
ALTER TABLE bot_personas
    DROP COLUMN IF EXISTS omniai_appearance;
