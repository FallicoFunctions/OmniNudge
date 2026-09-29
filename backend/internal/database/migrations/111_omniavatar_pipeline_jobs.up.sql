CREATE TABLE omniavatar_jobs (
  id UUID PRIMARY KEY CHECK (
    SUBSTRING(id::text FROM 15 FOR 1) = '4'
    AND SUBSTRING(id::text FROM 20 FOR 1) ~ '^[89ab]$'
  ),
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN (
    'queued', 'validating_image', 'generating_views', 'checking_consistency',
    'reconstructing', 'conforming_topology', 'texturing_pbr', 'separating_slots',
    'rigging_skinning', 'retargeting', 'testing', 'ready', 'published',
    'failed_retryable', 'manual_review', 'cancelled'
  )),
  resume_state TEXT CHECK (resume_state IS NULL OR resume_state IN (
    'queued', 'validating_image', 'generating_views', 'checking_consistency',
    'reconstructing', 'conforming_topology', 'texturing_pbr', 'separating_slots',
    'rigging_skinning', 'retargeting', 'testing', 'ready'
  )),
  retry_count SMALLINT NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 5),
  max_retries SMALLINT NOT NULL CHECK (max_retries BETWEEN 0 AND 5),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 28),
  failure_reason VARCHAR(128),
  idempotency_key VARCHAR(128) NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (updated_at >= created_at),
  CHECK (retry_count <= max_retries),
  CHECK (failure_reason IS NULL OR failure_reason ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CHECK (
    (state = 'failed_retryable' AND resume_state IS NOT NULL AND failure_reason IS NOT NULL)
    OR (state = 'manual_review' AND resume_state IS NULL AND failure_reason IS NOT NULL)
    OR (state NOT IN ('failed_retryable', 'manual_review') AND resume_state IS NULL AND failure_reason IS NULL)
  ),
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX idx_omniavatar_jobs_owner_updated
  ON omniavatar_jobs (owner_id, updated_at DESC);

CREATE INDEX idx_omniavatar_jobs_work_queue
  ON omniavatar_jobs (state, updated_at ASC)
  WHERE state NOT IN ('published', 'manual_review', 'cancelled');

CREATE TABLE omniavatar_job_events (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES omniavatar_jobs(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL CHECK (sequence BETWEEN 1 AND 27),
  from_state TEXT NOT NULL CHECK (from_state IN (
    'queued', 'validating_image', 'generating_views', 'checking_consistency',
    'reconstructing', 'conforming_topology', 'texturing_pbr', 'separating_slots',
    'rigging_skinning', 'retargeting', 'testing', 'ready', 'published',
    'failed_retryable', 'manual_review', 'cancelled'
  )),
  to_state TEXT NOT NULL CHECK (to_state IN (
    'queued', 'validating_image', 'generating_views', 'checking_consistency',
    'reconstructing', 'conforming_topology', 'texturing_pbr', 'separating_slots',
    'rigging_skinning', 'retargeting', 'testing', 'ready', 'published',
    'failed_retryable', 'manual_review', 'cancelled'
  )),
  reason_code VARCHAR(128),
  evidence JSONB,
  occurred_at TIMESTAMPTZ NOT NULL,
  CHECK (reason_code IS NULL OR reason_code ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CHECK (evidence IS NULL OR jsonb_typeof(evidence) = 'object'),
  UNIQUE (job_id, sequence)
);

CREATE INDEX idx_omniavatar_job_events_job
  ON omniavatar_job_events (job_id, sequence ASC);
