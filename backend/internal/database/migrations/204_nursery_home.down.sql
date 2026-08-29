-- Back to the nursery being undivided in the schema. Which house each character
-- lived in is lost; there is nowhere faithful to write it, and inferring it from
-- ownership afterwards would put every commandeered character back in a home
-- she had already left.
ALTER TABLE bot_personas
    DROP COLUMN IF EXISTS nursery_home;
