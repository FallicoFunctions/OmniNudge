-- Enforce that pending friendship rows always have a requester_id set.
-- Accepted rows may retain NULL (pre-105 data inserted without requester_id is valid there).
ALTER TABLE user_friendships
    ADD CONSTRAINT user_friendships_pending_requires_requester
    CHECK (status != 'pending' OR requester_id IS NOT NULL);
