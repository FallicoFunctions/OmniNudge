-- Create vote_activity table for tracking real-time vote patterns
CREATE TABLE vote_activity (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(20) NOT NULL,
    content_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voter_id INTEGER NOT NULL,
    is_upvote BOOLEAN NOT NULL,
    hour_bucket TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for velocity calculations (finding votes for specific content in time windows)
CREATE INDEX idx_vote_activity_content ON vote_activity(content_type, content_id, hour_bucket);

-- Index for calculating user baselines (finding all votes for a user's content)
CREATE INDEX idx_vote_activity_author ON vote_activity(author_id, hour_bucket);

COMMENT ON TABLE vote_activity IS 'Tracks vote events in hourly buckets for velocity calculations (7-day retention)';
COMMENT ON COLUMN vote_activity.hour_bucket IS 'Hour bucket for vote (date_trunc(hour, timestamp)) - enables efficient velocity queries';

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC VOTE TRACKING
-- =====================================================

-- Trigger function to record post vote activity
CREATE OR REPLACE FUNCTION record_post_vote_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Only record upvotes (downvotes don't trigger notifications)
    IF NEW.is_upvote = TRUE THEN
        INSERT INTO vote_activity (content_type, content_id, author_id, voter_id, is_upvote, hour_bucket)
        SELECT
            'post',
            NEW.post_id,
            p.author_id,
            NEW.user_id,
            TRUE,
            date_trunc('hour', CURRENT_TIMESTAMP)
        FROM platform_posts p
        WHERE p.id = NEW.post_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to post_votes table
CREATE TRIGGER post_vote_activity_trigger
AFTER INSERT ON post_votes
FOR EACH ROW
EXECUTE FUNCTION record_post_vote_activity();

-- Trigger function to record comment vote activity
CREATE OR REPLACE FUNCTION record_comment_vote_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Only record upvotes (downvotes don't trigger notifications)
    IF NEW.is_upvote = TRUE THEN
        INSERT INTO vote_activity (content_type, content_id, author_id, voter_id, is_upvote, hour_bucket)
        SELECT
            'comment',
            NEW.comment_id,
            c.user_id,
            NEW.user_id,
            TRUE,
            date_trunc('hour', CURRENT_TIMESTAMP)
        FROM post_comments c
        WHERE c.id = NEW.comment_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to comment_votes table
CREATE TRIGGER comment_vote_activity_trigger
AFTER INSERT ON comment_votes
FOR EACH ROW
EXECUTE FUNCTION record_comment_vote_activity();

COMMENT ON FUNCTION record_post_vote_activity() IS 'Automatically tracks upvotes on posts for velocity calculations';
COMMENT ON FUNCTION record_comment_vote_activity() IS 'Automatically tracks upvotes on comments for velocity calculations';
