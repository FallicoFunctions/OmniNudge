-- Create reddit_comment_votes table to track individual user votes on Reddit post comments
CREATE TABLE IF NOT EXISTS reddit_comment_votes (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES reddit_post_comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type INTEGER NOT NULL CHECK (vote_type IN (-1, 1)), -- -1 for downvote, 1 for upvote
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,

    -- Ensure one vote per user per comment
    UNIQUE(comment_id, user_id)
);

-- Index for faster lookups
CREATE INDEX idx_reddit_comment_votes_comment_id ON reddit_comment_votes(comment_id);
CREATE INDEX idx_reddit_comment_votes_user_id ON reddit_comment_votes(user_id);
