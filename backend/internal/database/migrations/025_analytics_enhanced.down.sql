-- Drop function
DROP FUNCTION IF EXISTS refresh_analytics_views();

-- Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS analytics_top_events;
DROP MATERIALIZED VIEW IF EXISTS analytics_daily_active_users;

-- Drop indexes
DROP INDEX IF EXISTS idx_analytics_events_utm_source;
DROP INDEX IF EXISTS idx_analytics_events_country;
DROP INDEX IF EXISTS idx_analytics_events_os;
DROP INDEX IF EXISTS idx_analytics_events_browser;
DROP INDEX IF EXISTS idx_analytics_events_device;
DROP INDEX IF EXISTS idx_analytics_events_session;
DROP INDEX IF EXISTS idx_analytics_sessions_anonymous;
DROP INDEX IF EXISTS idx_analytics_sessions_start_time;
DROP INDEX IF EXISTS idx_analytics_sessions_user;

-- Drop sessions table
DROP TABLE IF EXISTS analytics_sessions;

-- Remove added columns from analytics_events
ALTER TABLE analytics_events DROP COLUMN IF EXISTS utm_campaign;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS utm_source;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS referrer;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS city;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS country;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS os;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS browser;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS device_type;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS session_id;
