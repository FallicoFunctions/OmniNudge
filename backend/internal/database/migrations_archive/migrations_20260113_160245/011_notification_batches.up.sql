-- Create notification_batches table for scheduling delayed notifications
CREATE TABLE notification_batches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL,
    content_id INTEGER NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    votes_per_hour INTEGER,
    milestone_count INTEGER,
    scheduled_for TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Index for batch worker to efficiently find pending batches ready to process
CREATE INDEX idx_notification_batches_scheduled
    ON notification_batches(scheduled_for, status)
    WHERE status = 'pending';

-- Index for finding user's pending batches (for cancellation when velocity increases)
CREATE INDEX idx_notification_batches_user ON notification_batches(user_id, status);

COMMENT ON TABLE notification_batches IS 'Schedules notifications for future delivery (15-minute batching for normal activity)';
COMMENT ON COLUMN notification_batches.status IS 'Status values: pending, processed, cancelled';
COMMENT ON COLUMN notification_batches.scheduled_for IS 'Timestamp when notification should be sent (typically current_time + 15 minutes)';
COMMENT ON COLUMN notification_batches.processed_at IS 'When batch was actually processed by worker';
