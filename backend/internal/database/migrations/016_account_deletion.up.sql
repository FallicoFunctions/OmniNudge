-- Add deletion tracking columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS permanent_deletion_at TIMESTAMPTZ;

-- Account deletion audit log
CREATE TABLE IF NOT EXISTS account_deletion_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deletion_date TIMESTAMPTZ, -- When permanent deletion will occur
    reason VARCHAR(255), -- 'user_requested', 'deletion_cancelled', 'admin_deleted', etc.
    admin_id INTEGER REFERENCES users(id), -- If admin performed the deletion
    notes TEXT -- Additional context
);

-- Index for finding accounts to permanently delete
CREATE INDEX idx_users_pending_deletion ON users(permanent_deletion_at) WHERE deleted_at IS NOT NULL;

-- Index for audit log queries
CREATE INDEX idx_account_deletion_log_user ON account_deletion_log(user_id);
CREATE INDEX idx_account_deletion_log_requested_at ON account_deletion_log(requested_at DESC);
