-- Migration: 023_retention_settings
-- Purpose: Add admin-configurable data retention settings
-- Date: 2026-02-08

CREATE TABLE IF NOT EXISTS retention_settings (
    id SERIAL PRIMARY KEY,
    data_type VARCHAR(50) UNIQUE NOT NULL, -- messages, call_logs, archived_conversations, analytics_events, deleted_users
    retention_days INTEGER NOT NULL CHECK (retention_days > 0),
    enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    action TEXT, -- What happens when retention period expires
    reason TEXT, -- Why this retention period is set
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT valid_data_type CHECK (
        data_type IN (
            'messages',
            'call_logs',
            'archived_conversations',
            'analytics_events',
            'deleted_users',
            'audit_logs',
            'database_backups'
        )
    )
);

-- Create index for faster lookups
CREATE INDEX idx_retention_settings_data_type ON retention_settings(data_type);
CREATE INDEX idx_retention_settings_enabled ON retention_settings(enabled);

-- Insert default retention periods (matching current hardcoded values)
INSERT INTO retention_settings (data_type, retention_days, description, action, reason) VALUES
    ('messages', 1095, 'Direct messages and conversation content', 'Permanently delete message content', 'GDPR data minimization - keep for legal disputes'),
    ('call_logs', 365, 'Voice and video call metadata', 'Permanently delete call logs and quality metrics', 'Billing reconciliation and quality metrics'),
    ('archived_conversations', 365, 'Conversations archived by users', 'Permanently delete conversation and all messages', 'User archived, likely not needed long-term'),
    ('analytics_events', 730, 'User behavior analytics events', 'Remove user_id, ip_address, user_agent (anonymize)', 'GDPR - keep aggregate data, remove PII'),
    ('deleted_users', 30, 'Soft-deleted user accounts', 'Permanently delete user and all personal data', 'Allow user to undo deletion'),
    ('audit_logs', 2555, 'System audit and security logs', 'Never delete (legal requirement)', 'Legal compliance (SOX, GDPR, financial regulations)'),
    ('database_backups', 90, 'Full database backup files', 'Permanently delete backup files', 'Disaster recovery, data corruption recovery')
ON CONFLICT (data_type) DO NOTHING;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_retention_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retention_settings_updated_at_trigger
BEFORE UPDATE ON retention_settings
FOR EACH ROW
EXECUTE FUNCTION update_retention_settings_updated_at();

-- Add audit table for retention setting changes
CREATE TABLE IF NOT EXISTS retention_settings_audit (
    id SERIAL PRIMARY KEY,
    data_type VARCHAR(50) NOT NULL,
    old_retention_days INTEGER,
    new_retention_days INTEGER,
    old_enabled BOOLEAN,
    new_enabled BOOLEAN,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT
);

CREATE INDEX idx_retention_audit_data_type ON retention_settings_audit(data_type);
CREATE INDEX idx_retention_audit_changed_at ON retention_settings_audit(changed_at DESC);

-- Trigger to log all changes to retention settings
CREATE OR REPLACE FUNCTION audit_retention_settings_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.retention_days != NEW.retention_days OR OLD.enabled != NEW.enabled THEN
            INSERT INTO retention_settings_audit (
                data_type,
                old_retention_days,
                new_retention_days,
                old_enabled,
                new_enabled,
                changed_by
            ) VALUES (
                NEW.data_type,
                OLD.retention_days,
                NEW.retention_days,
                OLD.enabled,
                NEW.enabled,
                NEW.updated_by
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retention_settings_audit_trigger
AFTER UPDATE ON retention_settings
FOR EACH ROW
EXECUTE FUNCTION audit_retention_settings_changes();
