-- Restoring uniqueness is destructive, and it has to be: by the time this runs,
-- video jobs own both an intermediate still and a finished clip, and the
-- constraint cannot be validated while both exist. Dropping the surplus rows
-- here is what keeps the down migration from failing halfway, which is a worse
-- state than a documented deletion.
--
-- For each job, the survivor is its output_asset_id when one is recorded, and
-- otherwise its newest asset (a job still mid-render has no output yet).
-- COALESCE is required because `id = NULL` is NULL, and DESC sorts NULL first,
-- which would rank an unmatched row above the real output.
DELETE FROM omnichat_media_assets a
USING (
    SELECT ranked.id
    FROM (
        SELECT
            asset.id,
            ROW_NUMBER() OVER (
                PARTITION BY asset.generation_job_id
                ORDER BY
                    COALESCE(asset.id = job.output_asset_id, FALSE) DESC,
                    asset.created_at DESC,
                    asset.id DESC
            ) AS position
        FROM omnichat_media_assets asset
        JOIN omnichat_generation_jobs job ON job.id = asset.generation_job_id
    ) ranked
    WHERE ranked.position > 1
) surplus
WHERE a.id = surplus.id;

-- The backing media_files rows are left in place. They are referenced by
-- media_file_id ON DELETE RESTRICT and by the tracked-upload table, and the
-- storage objects behind them are unreachable from SQL, so removing the
-- metadata here would strand the bytes rather than reclaim them. Sweep them
-- with cmd/omnichat_delete_assets if a rollback is ever made permanent.

ALTER TABLE omnichat_media_assets
    DROP CONSTRAINT IF EXISTS omnichat_media_assets_generation_job_id_key;

ALTER TABLE omnichat_media_assets
    ADD CONSTRAINT omnichat_media_assets_generation_job_id_key UNIQUE (generation_job_id);

DROP INDEX IF EXISTS idx_omnichat_media_assets_generation_job;
