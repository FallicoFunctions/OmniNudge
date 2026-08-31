-- A supporting reference is its own kind of render.
--
-- Both a likeness and a reference are server-built, unbilled, SFW, and must
-- never become a gallery asset -- but they end differently, and the job row is
-- what tells the worker's completion which way to go. A likeness becomes one of
-- four pictures somebody chooses from. A reference becomes one of the six the
-- adapter is conditioned on, and nobody is ever shown it.
--
-- Distinguishing them by whether the job carries reference images would work
-- today and stop working the moment anything else conditions a render on one.
ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_mode_check;
ALTER TABLE omnichat_generation_jobs
    ADD CONSTRAINT omnichat_generation_jobs_mode_check
        CHECK (mode IN ('create', 'contextual', 'image_to_video', 'likeness', 'likeness_reference'));
