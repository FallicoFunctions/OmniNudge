-- Two more things a relationship holds: how much she is attached to this
-- person, and whether she is drawn to them.
--
-- Trust and warmth were carrying all of it, and they cannot. Somebody can be
-- immediately infatuated with a person they barely know, and somebody can trust
-- an old friend completely and feel nothing of the kind. Folding both into
-- warmth made "close" and "in love with you" the same answer, which is why the
-- creation flow had to offer a starting state called besotted -- a word about
-- attraction sitting on a ladder about trust.
--
-- Separated, the useful combinations exist. Guarded and attracted is a real
-- dynamic and a different character from close and unattracted; loves you but
-- is becoming less attached is a thing that happens to people and now has
-- somewhere to be recorded.
--
-- On the relationship row rather than the baseline, because neither is a
-- property of her. Nobody is attached in general. Both are toward somebody, and
-- the self tier keeps them at 0 for the same reason it holds no opinion about a
-- person it has not met.
ALTER TABLE omnichat_character_traits
    ADD COLUMN attachment REAL NOT NULL DEFAULT 0
        CHECK (attachment >= -1 AND attachment <= 1);

-- Attraction has a floor of 0 rather than -1. Negative trust is being wary and
-- negative warmth is disliking somebody, both of which are ordinary. A negative
-- attraction would be repulsion, which is not the other end of the same scale
-- and is not a state this product should model or let anybody configure.
ALTER TABLE omnichat_character_traits
    ADD COLUMN attraction REAL NOT NULL DEFAULT 0
        CHECK (attraction >= 0 AND attraction <= 1);
