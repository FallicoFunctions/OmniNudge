-- The queue handler has no user context: it processes a job id off Redis and
-- reads everything else from the row. The explicit-content entitlement is
-- therefore decided once, when the job is created and the caller's plan is
-- known, and recorded here for the handler to route on.
--
-- Defaulting to FALSE means existing jobs, and any job created before the
-- entitlement is wired, take the standard image endpoint.
ALTER TABLE omnichat_generation_jobs
    ADD COLUMN IF NOT EXISTS allow_nsfw BOOLEAN NOT NULL DEFAULT FALSE;
