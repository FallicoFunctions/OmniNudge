-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    anonymous_id UUID, -- For tracking before login
    properties JSONB DEFAULT '{}',
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User properties for segmentation
CREATE TABLE IF NOT EXISTS user_properties (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    properties JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_name_created ON analytics_events(event_name, created_at DESC);

-- GIN index for querying properties
CREATE INDEX idx_analytics_events_properties ON analytics_events USING GIN (properties);
CREATE INDEX idx_user_properties_properties ON user_properties USING GIN (properties);
