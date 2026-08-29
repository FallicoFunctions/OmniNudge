-- When a relationship ended, without ending what it made of her.
--
-- The first version of leaving deleted the creator's relational tier outright.
-- That was wrong on the design's own terms. §21: "a tier is not about whether
-- she holds a memory; it is about who she recalls it with... nothing is deleted
-- and nothing is hidden from her. She is not amnesiac about him; she is
-- discreet about him." And §20 makes leaving reversible -- "she can reach out
-- first" -- which nothing can do if the relationship it would reach back into
-- was destroyed.
--
-- §16's "cascades. Goes" is about account deletion, which is a privacy exit and
-- a different act. Deleting the character only "removes her from discovery and
-- from his own messages".
--
-- So the relationship is locked rather than erased. She keeps every episode and
-- every number those years moved, because that is who she now is; he simply
-- cannot reach her through it.
ALTER TABLE omnichat_character_traits
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Only a real relationship can end. The self tier is not one -- it belongs to
-- nobody, so there is nobody for it to have ended with.
ALTER TABLE omnichat_character_traits
    DROP CONSTRAINT IF EXISTS omnichat_character_traits_ended_is_relational;
ALTER TABLE omnichat_character_traits
    ADD CONSTRAINT omnichat_character_traits_ended_is_relational
        CHECK (ended_at IS NULL OR owner_user_id IS NOT NULL);
