-- What she looks like (§34, screens 1 to 4).
--
-- Stored now, generated later. Nothing can turn these answers into a likeness
-- yet -- the 2D generator does not exist and §34 makes the 3D body a separate
-- paid step -- but creation is the only moment somebody is thinking about how
-- she looks. Not capturing it means that when the generator does arrive, every
-- character made before it either stays blank or has to ask again, and asking
-- again is worse than asking once.
--
-- JSONB rather than eight columns because none of it is queried. It is a record
-- of what somebody chose, read whole by whatever eventually draws her, and eight
-- columns would be eight migrations the first time the form gains a question.
--
-- Only an OmniAI has one. A roleplay character's likeness comes from her card or
-- from an upload, so the column is nullable and stays NULL for her.
ALTER TABLE bot_personas
    ADD COLUMN IF NOT EXISTS omniai_appearance JSONB;
