-- What the two of them are to each other.
--
-- The creation flow asked "how drawn to you is she" on a screen that also asked
-- how she feels about you, and somebody making a friend was handed a question
-- about attraction they never wanted. The fix is to ask the plain thing first:
-- friend, situationship, partner, spouse. Attraction follows from the answer
-- instead of being a second question about the same subject.
--
-- On the relationship row for the same reason attachment and attraction are
-- there. Nobody is a spouse in general. It is toward somebody, and the self
-- tier holds none of it.
--
-- 'friend' is the default because it is the honest reading of a relationship
-- nobody described. Every row that existed before this column was created
-- without the question being asked, and inventing a romance for those is worse
-- than reading their silence as friendship.
ALTER TABLE omnichat_character_traits
    ADD COLUMN IF NOT EXISTS relationship_kind TEXT NOT NULL DEFAULT 'friend'
        CHECK (relationship_kind IN ('friend', 'situationship', 'partner', 'spouse'));
