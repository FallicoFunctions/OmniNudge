-- Create user_activity_baselines table for tracking user engagement patterns
CREATE TABLE user_activity_baselines (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avg_post_votes_per_hour DECIMAL(10,2) DEFAULT 0,
    avg_comment_votes_per_hour DECIMAL(10,2) DEFAULT 0,
    total_posts INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for finding users whose baselines need recalculation
CREATE INDEX idx_baselines_calculated ON user_activity_baselines(last_calculated_at);

COMMENT ON TABLE user_activity_baselines IS 'Stores calculated baseline metrics for personalized velocity notifications';
COMMENT ON COLUMN user_activity_baselines.avg_post_votes_per_hour IS 'Average upvotes/hour for user posts over adaptive time window';
COMMENT ON COLUMN user_activity_baselines.avg_comment_votes_per_hour IS 'Average upvotes/hour for user comments over adaptive time window';
COMMENT ON COLUMN user_activity_baselines.total_posts IS 'Total number of posts created (for determining user experience level)';
COMMENT ON COLUMN user_activity_baselines.total_comments IS 'Total number of comments created (for determining user experience level)';
