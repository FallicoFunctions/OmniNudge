-- group_member_restrictions: tracks active mutes and bans within group conversations.
-- expires_at NULL means permanent; non-NULL means temporary (auto-expires by query predicate).
CREATE TABLE group_member_restrictions (
    id               SERIAL       PRIMARY KEY,
    conversation_id  INTEGER      NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id          INTEGER      NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    restricted_by    INTEGER      NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    restriction_type VARCHAR(10)  NOT NULL CHECK (restriction_type IN ('mute', 'ban')),
    reason           TEXT,
    expires_at       TIMESTAMPTZ,                        -- NULL = permanent restriction
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Fast lookup for restriction checks on every message send
CREATE INDEX idx_gmr_conv_user_type ON group_member_restrictions (conversation_id, user_id, restriction_type);
-- Enables efficient expiry cleanup jobs
CREATE INDEX idx_gmr_expires ON group_member_restrictions (expires_at) WHERE expires_at IS NOT NULL;

-- group_audit_log: immutable record of every admin action in a group.
-- Append-only — rows are never updated or deleted (compliance requirement).
CREATE TABLE group_audit_log (
    id               SERIAL       PRIMARY KEY,
    conversation_id  INTEGER      NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    admin_id         INTEGER      NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    action_type      VARCHAR(30)  NOT NULL,
    target_user_id   INTEGER               REFERENCES users(id)         ON DELETE SET NULL,
    details          JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gal_conv_created ON group_audit_log (conversation_id, created_at DESC);
CREATE INDEX idx_gal_admin_id     ON group_audit_log (admin_id);

-- slow_mode_seconds: 0 = disabled.
-- When > 0, non-admin group members must wait this many seconds between messages.
-- Enforcement uses Redis (key: slowmode:{conv_id}:{user_id}, TTL = slow_mode_seconds).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS slow_mode_seconds INTEGER NOT NULL DEFAULT 0;

-- deleted_by_admin: allows admins to remove any message from a group conversation.
-- Visibility: messages where deleted_by_admin = TRUE are shown as "[Deleted by admin]".
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_admin BOOLEAN NOT NULL DEFAULT FALSE;
