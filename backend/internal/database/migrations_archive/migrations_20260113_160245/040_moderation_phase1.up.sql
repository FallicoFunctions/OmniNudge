-- Phase 1 Moderation Features
-- User bans, content removal tracking, mod logs, removal reasons

-- Hub user bans table
CREATE TABLE IF NOT EXISTS hub_bans (
    id SERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by INTEGER NOT NULL REFERENCES users(id),
    reason TEXT,
    note TEXT, -- Private mod note
    ban_type VARCHAR(20) NOT NULL CHECK (ban_type IN ('permanent', 'temporary')),
    expires_at TIMESTAMPTZ, -- NULL for permanent bans
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(hub_id, user_id)
);

CREATE INDEX idx_hub_bans_hub ON hub_bans(hub_id);
CREATE INDEX idx_hub_bans_user ON hub_bans(user_id);
CREATE INDEX idx_hub_bans_expires ON hub_bans(expires_at) WHERE expires_at IS NOT NULL;

-- Removed content tracking (for posts and comments)
CREATE TABLE IF NOT EXISTS removed_content (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'comment')),
    content_id INTEGER NOT NULL,
    hub_id INTEGER REFERENCES hubs(id) ON DELETE CASCADE,
    removed_by INTEGER NOT NULL REFERENCES users(id),
    removal_reason_id INTEGER, -- Will reference removal_reasons table
    custom_reason TEXT, -- Optional custom explanation
    mod_note TEXT, -- Private note for mod team
    removed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(content_type, content_id)
);

CREATE INDEX idx_removed_content_type_id ON removed_content(content_type, content_id);
CREATE INDEX idx_removed_content_hub ON removed_content(hub_id);
CREATE INDEX idx_removed_content_removed_at ON removed_content(removed_at);

-- Removal reason templates
CREATE TABLE IF NOT EXISTS removal_reasons (
    id SERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_removal_reasons_hub ON removal_reasons(hub_id);

-- Add foreign key to removed_content now that removal_reasons exists
ALTER TABLE removed_content
    ADD CONSTRAINT fk_removed_content_reason
    FOREIGN KEY (removal_reason_id)
    REFERENCES removal_reasons(id)
    ON DELETE SET NULL;

-- Moderation log (audit trail)
CREATE TABLE IF NOT EXISTS mod_logs (
    id SERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    moderator_id INTEGER NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'ban_user', 'unban_user', 'remove_post', 'approve_post',
        'remove_comment', 'approve_comment', 'lock_post', 'unlock_post',
        'pin_post', 'unpin_post', 'add_moderator', 'remove_moderator',
        'update_removal_reason', 'create_removal_reason', 'delete_removal_reason'
    )),
    target_type VARCHAR(20), -- 'user', 'post', 'comment', 'removal_reason'
    target_id INTEGER,
    details JSONB, -- Flexible field for action-specific details
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mod_logs_hub ON mod_logs(hub_id);
CREATE INDEX idx_mod_logs_moderator ON mod_logs(moderator_id);
CREATE INDEX idx_mod_logs_action ON mod_logs(action);
CREATE INDEX idx_mod_logs_created_at ON mod_logs(created_at DESC);
CREATE INDEX idx_mod_logs_target ON mod_logs(target_type, target_id);

-- Add mod-related fields to platform_posts
ALTER TABLE platform_posts
    ADD COLUMN IF NOT EXISTS is_removed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_by INTEGER REFERENCES users(id);

CREATE INDEX idx_posts_removed ON platform_posts(is_removed);
CREATE INDEX idx_posts_pinned ON platform_posts(hub_id, is_pinned) WHERE is_pinned = TRUE;

-- Add mod-related fields to post_comments
ALTER TABLE post_comments
    ADD COLUMN IF NOT EXISTS is_removed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_by INTEGER REFERENCES users(id);

CREATE INDEX idx_comments_removed ON post_comments(is_removed);

-- Mod queue view (combines reports with removed content for easy moderation)
CREATE OR REPLACE VIEW mod_queue AS
SELECT
    'report' as queue_type,
    r.id as queue_id,
    r.target_type,
    r.target_id,
    r.reason as content,
    r.status,
    r.created_at,
    NULL::INTEGER as hub_id,
    r.reporter_id as actor_id,
    NULL::TEXT as mod_note
FROM reports r
WHERE r.status = 'open'

UNION ALL

SELECT
    'removed_content' as queue_type,
    rc.id as queue_id,
    rc.content_type as target_type,
    rc.content_id as target_id,
    rc.custom_reason as content,
    'reviewed' as status,
    rc.removed_at as created_at,
    rc.hub_id,
    rc.removed_by as actor_id,
    rc.mod_note
FROM removed_content rc;
