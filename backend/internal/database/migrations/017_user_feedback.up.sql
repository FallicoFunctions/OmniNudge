-- User feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    category VARCHAR(50) NOT NULL, -- 'bug', 'feature_request', 'other'
    message TEXT NOT NULL,
    page_url TEXT, -- URL where feedback was submitted
    user_agent TEXT,
    screenshot_url TEXT, -- Optional screenshot
    status VARCHAR(50) DEFAULT 'new', -- 'new', 'reviewed', 'resolved', 'ignored'
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by INTEGER REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_user_feedback_user ON user_feedback(user_id);
CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX idx_user_feedback_status ON user_feedback(status);
CREATE INDEX idx_user_feedback_category ON user_feedback(category);
