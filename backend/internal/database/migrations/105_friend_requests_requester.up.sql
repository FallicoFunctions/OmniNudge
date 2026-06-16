-- Add requester_id so we can track who initiated a pending friend request.
-- Existing rows are all 'accepted' (no pending state was in use) so NULL is fine for them.
ALTER TABLE user_friendships
    ADD COLUMN IF NOT EXISTS requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
