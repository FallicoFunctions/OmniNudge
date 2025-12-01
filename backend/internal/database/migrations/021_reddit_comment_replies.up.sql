-- Migration 021: Add support for replying to Reddit API comments
-- Allows local comments to be replies to Reddit's API comments (read-only comments from Reddit)

ALTER TABLE reddit_post_comments
ADD COLUMN parent_reddit_comment_id VARCHAR(255);

-- Add index for efficient querying of replies to Reddit comments
CREATE INDEX idx_reddit_post_comments_reddit_parent ON reddit_post_comments(parent_reddit_comment_id) WHERE deleted_at IS NULL AND parent_reddit_comment_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN reddit_post_comments.parent_reddit_comment_id IS 'Reddit API comment ID that this comment is replying to (for replying to Reddit comments directly)';
