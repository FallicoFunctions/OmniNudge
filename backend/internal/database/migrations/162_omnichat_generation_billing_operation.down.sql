DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM omnichat_generation_jobs
        WHERE billing_operation_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'cannot roll back generation billing while billed jobs remain';
    END IF;
END;
$$;

ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_video_billing_check,
    DROP COLUMN IF EXISTS billing_operation_id;
