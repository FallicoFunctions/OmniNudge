-- The four pictures somebody chooses her face from.
--
-- Deliberately not omnichat_media_assets. An asset row means the user owns this
-- and can see it, which is true of exactly one of the four and only after they
-- choose. Seventeen queries read that table, two of them publications and the
-- data export, and a discarded candidate must never reach either -- so it is
-- kept out by construction rather than by seventeen correct filters.
--
-- Discarding is free without it. The deletion outbox added in 161 fires on
-- media_files, so removing the three nobody picked hands their stored objects
-- to the retention worker with no extra machinery. Verified against a real
-- database rather than read out of the migration.
--
-- The table is transient: rows exist only while a choice is open. Picking
-- removes all four -- three files with them, the fourth promoted to her avatar
-- and her private identity reference -- so there is no chosen column, because a
-- chosen candidate is no longer a candidate.
CREATE TABLE IF NOT EXISTS omnichat_omniai_likeness_candidates (
    id                BIGSERIAL PRIMARY KEY,
    persona_id        INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
    owner_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generation_job_id UUID    NOT NULL REFERENCES omnichat_generation_jobs(id) ON DELETE CASCADE,

    -- CASCADE, and it has to be. The only foreign key into media_files that
    -- RESTRICTs is omnichat_media_assets; if this one did the same, the row
    -- whose whole job is to track a candidate would block the delete that
    -- discards it.
    media_file_id     INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One candidate per render. A job that somehow completed twice would otherwise
-- offer the same picture as two different choices.
CREATE UNIQUE INDEX IF NOT EXISTS idx_omniai_likeness_candidates_job
    ON omnichat_omniai_likeness_candidates(generation_job_id);

-- The read is always "show me her candidates", oldest first so the four appear
-- in the order they were asked for rather than the order they finished.
CREATE INDEX IF NOT EXISTS idx_omniai_likeness_candidates_persona
    ON omnichat_omniai_likeness_candidates(persona_id, created_at);

-- A likeness is its own mode on the job row.
--
-- Not a fourth mode for the provider, which still gets "create": this word is
-- how the system tells its own paths apart, so a render that must never become
-- a gallery asset cannot be confused with one that must.
ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_mode_check;
ALTER TABLE omnichat_generation_jobs
    ADD CONSTRAINT omnichat_generation_jobs_mode_check
        CHECK (mode IN ('create', 'contextual', 'image_to_video', 'likeness'));
