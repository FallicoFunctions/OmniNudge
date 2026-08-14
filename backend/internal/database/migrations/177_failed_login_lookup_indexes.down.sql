CREATE INDEX IF NOT EXISTS idx_failed_login_identifier
    ON failed_login_attempts (identifier);
DROP INDEX IF EXISTS idx_failed_login_identifier_time;
DROP INDEX IF EXISTS idx_failed_login_ip_time;
