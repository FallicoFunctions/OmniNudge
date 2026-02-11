-- Feature flags table with corrected schema
CREATE TABLE IF NOT EXISTS feature_flags (
    key VARCHAR(255) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT NOT NULL,
    percentage INTEGER CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
    environment VARCHAR(50) NOT NULL DEFAULT 'all', -- 'all', 'dev', 'staging', 'prod'
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN feature_flags.percentage IS 'Percentage of users to enable (0-100). NULL = not using percentage rollout. Only applies when enabled = true.';
COMMENT ON COLUMN feature_flags.environment IS 'Environment where flag applies. Use "all" for all environments.';

-- Separate table for user overrides (efficient queries)
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
    flag_key VARCHAR(255) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (flag_key, user_id)
);

CREATE INDEX idx_feature_flag_overrides_user ON feature_flag_overrides(user_id);

-- Complete audit log (tracks ALL changes)
CREATE TABLE IF NOT EXISTS feature_flag_audit (
    id SERIAL PRIMARY KEY,
    flag_key VARCHAR(255) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL, -- 'created', 'enabled', 'disabled', 'percentage_changed', 'override_set', 'override_removed'
    changed_by INTEGER NOT NULL REFERENCES users(id),
    old_value JSONB, -- {enabled: bool, percentage: int} or {user_id: int, enabled: bool}
    new_value JSONB, -- {enabled: bool, percentage: int} or {user_id: int, enabled: bool}
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_flag_audit_flag ON feature_flag_audit(flag_key);
CREATE INDEX idx_feature_flag_audit_changed_at ON feature_flag_audit(changed_at DESC);

-- Insert default flags for Phase 2 features (consistent naming: feature_*)
INSERT INTO feature_flags (key, enabled, description, environment) VALUES
    ('feature_reactions', false, 'Message reactions (Feature 1)', 'all'),
    ('feature_pinned_messages', false, 'Pin important messages (Feature 2)', 'all'),
    ('feature_message_editing', false, 'Edit sent messages (Feature 3)', 'all'),
    ('feature_message_search', false, 'Search messages (Feature 4)', 'all'),
    ('feature_folders', false, 'Organize conversations in folders (Feature 5)', 'all'),
    ('feature_file_sharing', false, 'Share files in messages (Feature 6)', 'all'),
    ('feature_themes', false, 'Custom UI themes (Feature 7)', 'all'),
    ('feature_read_receipts', false, 'Read receipts (Feature 8)', 'all'),
    ('feature_groups', false, 'Group conversations (Feature 9)', 'all'),
    ('feature_audit_logs', false, 'Admin audit logs (Feature 10)', 'all'),
    ('feature_voice_messages', false, 'Voice messages (Feature 11)', 'all'),
    ('feature_voice_calls', false, 'Voice calling (Feature 12)', 'all'),
    ('feature_video_calls', false, 'Video calling (Feature 13)', 'all'),
    ('feature_screen_sharing', false, 'Screen sharing (Feature 14)', 'all')
ON CONFLICT (key) DO NOTHING;
