-- Policy acceptance tracking for GDPR compliance
CREATE TABLE IF NOT EXISTS policy_acceptances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_type VARCHAR(50) NOT NULL, -- 'privacy_policy', 'terms_of_service'
    version VARCHAR(20) NOT NULL, -- e.g., '1.0', '2.0'
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET, -- IP address at time of acceptance
    user_agent TEXT, -- Browser info at time of acceptance
    CONSTRAINT unique_user_policy_version UNIQUE(user_id, policy_type, version)
);

-- Index for fast lookup by user
CREATE INDEX idx_policy_acceptances_user ON policy_acceptances(user_id);

-- Index for audit queries
CREATE INDEX idx_policy_acceptances_type_version ON policy_acceptances(policy_type, version);

-- Add policy version columns to track what users agreed to
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_of_service_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
