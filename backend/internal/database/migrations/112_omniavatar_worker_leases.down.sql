DROP INDEX IF EXISTS idx_omniavatar_jobs_claim;

ALTER TABLE omniavatar_jobs
  DROP CONSTRAINT IF EXISTS omniavatar_jobs_terminal_not_leased,
  DROP CONSTRAINT IF EXISTS omniavatar_jobs_lease_token_v4,
  DROP CONSTRAINT IF EXISTS omniavatar_jobs_worker_id,
  DROP CONSTRAINT IF EXISTS omniavatar_jobs_lease_shape,
  DROP COLUMN IF EXISTS lease_attempt,
  DROP COLUMN IF EXISTS last_claimed_at,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS leased_by,
  DROP COLUMN IF EXISTS lease_token;
