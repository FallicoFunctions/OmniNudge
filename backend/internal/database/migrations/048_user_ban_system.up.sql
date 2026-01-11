-- Add ban-related fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS shadow_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_ban_reason BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Create ban_history table for audit trail
CREATE TABLE IF NOT EXISTS ban_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'shadow_ban', 'ban', 'unban', 'delete', 'restore'
    reason TEXT NOT NULL,
    show_reason BOOLEAN NOT NULL DEFAULT FALSE,
    admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_shadow_banned ON users(shadow_banned) WHERE shadow_banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned) WHERE banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted) WHERE deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_ban_history_user_id ON ban_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ban_history_created_at ON ban_history(created_at DESC);
