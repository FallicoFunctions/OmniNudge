-- Any choice still open is lost. The media files survive: they belong to
-- media_files and are cleaned up through the deletion outbox rather than
-- through this table, so removing it strands pictures rather than deleting
-- them.
DROP TABLE IF EXISTS omnichat_omniai_likeness_candidates;

-- Back to three modes. Any likeness job still on the row would fail the
-- narrowed check, so they are retired first: a job whose mode no longer exists
-- cannot be processed either way, and failing it says so.
UPDATE omnichat_generation_jobs
   SET status = 'failed', error_code = 'mode_retired', completed_at = COALESCE(completed_at, NOW())
 WHERE mode = 'likeness' AND status IN ('queued', 'running');
UPDATE omnichat_generation_jobs SET mode = 'create' WHERE mode = 'likeness';

ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_mode_check;
ALTER TABLE omnichat_generation_jobs
    ADD CONSTRAINT omnichat_generation_jobs_mode_check
        CHECK (mode IN ('create', 'contextual', 'image_to_video'));
