-- Add enhanced analytics fields to analytics_events table
-- NOTE: If analytics_events is large (>1M rows), consider adding columns in separate migration
-- during low-traffic period to avoid long locks
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS device_type VARCHAR(20);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS browser VARCHAR(50);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS os VARCHAR(50);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS country VARCHAR(2);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100);

-- Create analytics_sessions table for session tracking
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    anonymous_id UUID,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration INTEGER, -- seconds
    page_views INTEGER DEFAULT 0,
    events INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics_sessions
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start_time ON analytics_sessions(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_anonymous ON analytics_sessions(anonymous_id);

-- Index for session lookup in events
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);

-- Indexes for device/browser/OS analysis
CREATE INDEX IF NOT EXISTS idx_analytics_events_device ON analytics_events(device_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_browser ON analytics_events(browser);
CREATE INDEX IF NOT EXISTS idx_analytics_events_os ON analytics_events(os);

-- Index for geographic analysis
CREATE INDEX IF NOT EXISTS idx_analytics_events_country ON analytics_events(country);

-- Index for marketing attribution
CREATE INDEX IF NOT EXISTS idx_analytics_events_utm_source ON analytics_events(utm_source);

-- Create materialized view for daily active users (for faster dashboard queries)
-- Only keeps last 90 days to prevent unbounded growth
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_daily_active_users AS
SELECT
    created_at::date as date,
    COUNT(DISTINCT user_id) as dau,
    COUNT(DISTINCT CASE WHEN device_type = 'mobile' THEN user_id END) as mobile_dau,
    COUNT(DISTINCT CASE WHEN device_type = 'desktop' THEN user_id END) as desktop_dau
FROM analytics_events
WHERE user_id IS NOT NULL
  AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY created_at::date
ORDER BY date DESC;

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_dau_date ON analytics_daily_active_users(date);

-- Create materialized view for top events (updated hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_top_events AS
SELECT
    event_name,
    COUNT(*) as total_count,
    COUNT(DISTINCT user_id) as unique_users,
    DATE_TRUNC('hour', created_at) as hour
FROM analytics_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY event_name, DATE_TRUNC('hour', created_at)
ORDER BY hour DESC, total_count DESC;

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_analytics_top_events_hour ON analytics_top_events(hour DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_top_events_name ON analytics_top_events(event_name);

-- NOTE: To refresh materialized views manually, run:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_daily_active_users;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_top_events;
--
-- For automated refresh, set up a cron job or scheduled task
