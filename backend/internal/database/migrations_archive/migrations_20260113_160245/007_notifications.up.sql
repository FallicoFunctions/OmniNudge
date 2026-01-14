-- Create notifications table for storing user notifications
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    content_type VARCHAR(20), -- 'post' or 'comment'
    content_id INTEGER,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    milestone_count INTEGER,
    votes_per_hour INTEGER,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_milestone_notification
        UNIQUE (user_id, content_type, content_id, notification_type, milestone_count)
);

-- Index for fetching user's unread notifications (most common query)
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read, created_at DESC);

-- Index for fetching user's all notifications sorted by date
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Index for filtering by notification type
CREATE INDEX idx_notifications_type ON notifications(notification_type);

COMMENT ON TABLE notifications IS 'Stores all user notifications including vote milestones, velocity alerts, and comment replies';
COMMENT ON COLUMN notifications.notification_type IS 'Types: post_milestone, post_velocity, comment_milestone, comment_velocity, comment_reply, post_comment';
COMMENT ON COLUMN notifications.milestone_count IS 'For milestone notifications: 10, 50, 100, 500, etc.';
COMMENT ON COLUMN notifications.votes_per_hour IS 'For velocity notifications: calculated votes/hour rate';
