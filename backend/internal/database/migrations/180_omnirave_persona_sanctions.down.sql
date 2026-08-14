-- Rolling back readmits every withdrawn and suspended character.
--
-- The sanctions are the only record that those decisions were ever made, so
-- dropping the table loses them and the characters become admissible again on
-- the next request. That is the honest consequence of rolling back the
-- migration that created the ability to refuse -- there is nowhere else to put
-- the decisions, because before this migration there was nowhere at all.

DROP INDEX IF EXISTS idx_omnirave_persona_sanctions_active;

DROP TABLE IF EXISTS omnirave_persona_sanctions;
