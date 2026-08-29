-- Back to attraction alone saying whether there is anything romantic here. The
-- kind is lost rather than encoded into attraction: a spouse and a
-- situationship can sit at the same attraction and are not the same
-- relationship, so there is nothing faithful to write back.
ALTER TABLE omnichat_character_traits
    DROP COLUMN IF EXISTS relationship_kind;
