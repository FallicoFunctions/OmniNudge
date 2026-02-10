-- Rollback: 023_retention_settings
-- Purpose: Remove admin-configurable data retention settings

-- Drop triggers
DROP TRIGGER IF EXISTS retention_settings_audit_trigger ON retention_settings;
DROP TRIGGER IF EXISTS retention_settings_updated_at_trigger ON retention_settings;

-- Drop functions
DROP FUNCTION IF EXISTS audit_retention_settings_changes();
DROP FUNCTION IF EXISTS update_retention_settings_updated_at();

-- Drop tables
DROP TABLE IF EXISTS retention_settings_audit;
DROP TABLE IF EXISTS retention_settings;
