-- Video generation renders in two phases: the image endpoint produces an
-- identity-correct still, then the video endpoint animates it. Both artifacts
-- belong to the same generation job, but migration 137 made
-- omnichat_media_assets.generation_job_id UNIQUE, so a job could own only one.
--
-- The uniqueness was never load-bearing. Nothing queries assets by job id --
-- only the insert and the asset select list reference the column -- and
-- omnichat_generation_jobs.output_asset_id already identifies which artifact
-- is the job's result. A plain index preserves the lookup cost.
ALTER TABLE omnichat_media_assets
    DROP CONSTRAINT IF EXISTS omnichat_media_assets_generation_job_id_key;

CREATE INDEX IF NOT EXISTS idx_omnichat_media_assets_generation_job
    ON omnichat_media_assets(generation_job_id);
