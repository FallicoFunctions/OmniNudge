-- Add request metadata columns for session tracking (best-effort, safe to re-run)
ALTER TABLE analytics_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE analytics_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;

