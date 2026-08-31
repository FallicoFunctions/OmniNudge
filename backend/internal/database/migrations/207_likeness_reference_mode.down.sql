-- Back to four modes. Any reference render still in flight is retired first: a
-- job whose mode no longer exists cannot be processed either way, and failing
-- it says so rather than leaving a row that fails the narrowed check.
--
-- Completed ones are read as plain likenesses. That is wrong about what they
-- were for and right about what they are: a picture of her that never became a
-- gallery asset.
UPDATE omnichat_generation_jobs
   SET status = 'failed', error_code = 'mode_retired', completed_at = COALESCE(completed_at, NOW())
 WHERE mode = 'likeness_reference' AND status IN ('queued', 'running');
UPDATE omnichat_generation_jobs SET mode = 'likeness' WHERE mode = 'likeness_reference';

ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_mode_check;
ALTER TABLE omnichat_generation_jobs
    ADD CONSTRAINT omnichat_generation_jobs_mode_check
        CHECK (mode IN ('create', 'contextual', 'image_to_video', 'likeness'));
