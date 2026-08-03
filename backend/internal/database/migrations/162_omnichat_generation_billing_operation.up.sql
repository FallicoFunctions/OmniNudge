ALTER TABLE omnichat_generation_jobs
    ADD COLUMN IF NOT EXISTS billing_operation_id UUID;

ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_video_billing_check,
    ADD CONSTRAINT omnichat_generation_jobs_video_billing_check
        CHECK (kind <> 'video' OR billing_operation_id IS NOT NULL);
