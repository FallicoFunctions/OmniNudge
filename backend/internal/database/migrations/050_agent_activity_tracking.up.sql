-- Add agent activity tracking fields to users table
ALTER TABLE users
ADD COLUMN last_agent_post_at TIMESTAMP,
ADD COLUMN last_agent_browse_at TIMESTAMP;

-- Create index for efficient querying
CREATE INDEX idx_users_agent_activity ON users(last_agent_post_at, last_agent_browse_at);
