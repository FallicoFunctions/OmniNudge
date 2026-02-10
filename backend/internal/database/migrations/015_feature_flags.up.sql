-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
    key VARCHAR(255) PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT NOT NULL,
    overrides JSONB NOT NULL DEFAULT '{}', -- user_id -> enabled map
    metadata JSONB NOT NULL DEFAULT '{}', -- arbitrary metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log for flag changes
CREATE TABLE IF NOT EXISTS feature_flag_audit (
    id SERIAL PRIMARY KEY,
    flag_key VARCHAR(255) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    enabled BOOLEAN NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feature_flag_audit_flag ON feature_flag_audit(flag_key);
CREATE INDEX idx_feature_flag_audit_changed_at ON feature_flag_audit(changed_at DESC);

-- Insert default flags for Phase 2 features
INSERT INTO feature_flags (key, enabled, description) VALUES
    ('group_messaging', false, 'Enable group conversations (Feature 9)'),
    ('voice_calls', false, 'Enable voice calling (Feature 11)'),
    ('video_calls', false, 'Enable video calling (Feature 11)'),
    ('screen_sharing', false, 'Enable screen sharing (Feature 11)'),
    ('hub_polls', false, 'Enable hub polls (Feature 10)'),
    ('hub_wiki', false, 'Enable hub wikis (Feature 8)'),
    ('advanced_search', false, 'Enable advanced search filters (Feature 12)'),
    ('content_moderation', false, 'Enable automated content moderation'),
    ('analytics', false, 'Enable analytics tracking'),
    ('push_notifications', false, 'Enable push notifications')
ON CONFLICT (key) DO NOTHING;
