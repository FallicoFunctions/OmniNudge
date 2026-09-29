ALTER TABLE omniavatar_jobs
  ADD COLUMN lease_token UUID,
  ADD COLUMN leased_by VARCHAR(128),
  ADD COLUMN lease_expires_at TIMESTAMPTZ,
  ADD COLUMN last_claimed_at TIMESTAMPTZ,
  ADD COLUMN lease_attempt BIGINT NOT NULL DEFAULT 0 CHECK (lease_attempt >= 0),
  ADD CONSTRAINT omniavatar_jobs_lease_shape CHECK (
    (lease_token IS NULL AND leased_by IS NULL AND lease_expires_at IS NULL)
    OR
    (lease_token IS NOT NULL AND leased_by IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  ADD CONSTRAINT omniavatar_jobs_worker_id CHECK (
    leased_by IS NULL OR leased_by ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  ADD CONSTRAINT omniavatar_jobs_lease_token_v4 CHECK (
    lease_token IS NULL OR (
      SUBSTRING(lease_token::text FROM 15 FOR 1) = '4'
      AND SUBSTRING(lease_token::text FROM 20 FOR 1) ~ '^[89ab]$'
    )
  ),
  ADD CONSTRAINT omniavatar_jobs_terminal_not_leased CHECK (
    state NOT IN ('published', 'manual_review', 'cancelled') OR lease_token IS NULL
  );

CREATE INDEX idx_omniavatar_jobs_claim
  ON omniavatar_jobs (COALESCE(last_claimed_at, created_at) ASC, id ASC)
  WHERE state NOT IN ('published', 'manual_review', 'cancelled');
