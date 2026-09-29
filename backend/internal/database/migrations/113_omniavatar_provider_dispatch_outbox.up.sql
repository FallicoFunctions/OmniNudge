CREATE TABLE omniavatar_provider_dispatches (
  id UUID PRIMARY KEY CHECK (
    SUBSTRING(id::text FROM 15 FOR 1) = '4'
    AND SUBSTRING(id::text FROM 20 FOR 1) ~ '^[89ab]$'
  ),
  job_id UUID NOT NULL REFERENCES omniavatar_jobs(id) ON DELETE CASCADE,
  job_version BIGINT NOT NULL CHECK (job_version BETWEEN 2 AND 28),
  provider VARCHAR(128) NOT NULL CHECK (provider ~ '^[A-Za-z0-9._:-]{1,128}$'),
  request JSONB NOT NULL CHECK (
    jsonb_typeof(request) = 'object'
    AND request ?& ARRAY['jobId', 'ownerId', 'referenceKeys', 'idempotencyKey', 'maxCredits', 'model']
    AND request->>'jobId' = job_id::text
    AND request->>'idempotencyKey' = 'omniavatar:' || id::text
    AND jsonb_typeof(request->'ownerId') = 'number'
    AND jsonb_typeof(request->'referenceKeys') = 'array'
    AND jsonb_array_length(request->'referenceKeys') BETWEEN 6 AND 7
    AND jsonb_typeof(request->'maxCredits') = 'number'
    AND (request->>'maxCredits')::integer > 0
    AND jsonb_typeof(request->'model') = 'string'
  ),
  status TEXT NOT NULL CHECK (status IN ('pending', 'submitted', 'failed', 'cancelled')),
  provider_task JSONB,
  attempt SMALLINT NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 5),
  last_error_code VARCHAR(128),
  available_at TIMESTAMPTZ NOT NULL,
  lease_token UUID,
  leased_by VARCHAR(128),
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (updated_at >= created_at),
  CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CHECK (
    (lease_token IS NULL AND leased_by IS NULL AND lease_expires_at IS NULL)
    OR
    (status = 'pending' AND lease_token IS NOT NULL AND leased_by IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK (leased_by IS NULL OR leased_by ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CHECK (
    lease_token IS NULL OR (
      SUBSTRING(lease_token::text FROM 15 FOR 1) = '4'
      AND SUBSTRING(lease_token::text FROM 20 FOR 1) ~ '^[89ab]$'
    )
  ),
  CHECK (
    (status = 'pending' AND provider_task IS NULL AND attempt < 5)
    OR (status = 'submitted' AND jsonb_typeof(provider_task) = 'object')
    OR (status = 'failed' AND provider_task IS NULL AND attempt = 5 AND last_error_code IS NOT NULL)
    OR (status = 'cancelled' AND provider_task IS NULL)
  ),
  UNIQUE (job_id, job_version)
);

CREATE UNIQUE INDEX idx_omniavatar_provider_dispatch_idempotency
  ON omniavatar_provider_dispatches (provider, (request->>'idempotencyKey'));

CREATE INDEX idx_omniavatar_provider_dispatch_claim
  ON omniavatar_provider_dispatches (available_at ASC, created_at ASC, id ASC)
  WHERE status = 'pending' AND attempt < 5;
