-- OmniChat media generation foundation. Generated assets are private by
-- default; publishing is modeled separately so private source records never
-- become directly enumerable.

ALTER TABLE bot_conversations
    ADD COLUMN IF NOT EXISTS scene_state JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE bot_conversations
    DROP CONSTRAINT IF EXISTS bot_conversations_scene_state_object;

ALTER TABLE bot_conversations
    ADD CONSTRAINT bot_conversations_scene_state_object
    CHECK (jsonb_typeof(scene_state) = 'object');

CREATE TABLE IF NOT EXISTS omnichat_generation_jobs (
    id                  UUID PRIMARY KEY,
    owner_user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id          INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    conversation_id     INTEGER REFERENCES bot_conversations(id) ON DELETE CASCADE,
    source_message_id   INTEGER REFERENCES bot_messages(id) ON DELETE SET NULL,
    source_asset_id     UUID,
    output_asset_id     UUID,
    kind                VARCHAR(10) NOT NULL CHECK (kind IN ('image', 'video')),
    mode                VARCHAR(20) NOT NULL CHECK (mode IN ('create', 'contextual', 'image_to_video')),
    status              VARCHAR(12) NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    prompt              TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 2000),
    negative_prompt     TEXT NOT NULL DEFAULT '' CHECK (char_length(negative_prompt) <= 1000),
    effective_prompt    TEXT NOT NULL CHECK (char_length(effective_prompt) BETWEEN 1 AND 5000),
    aspect_ratio        VARCHAR(5) NOT NULL,
    duration_seconds    INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 3 AND 10),
    scene_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scene_snapshot) = 'object'),
    provider            VARCHAR(40),
    provider_job_id     VARCHAR(255),
    progress            SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    error_code          VARCHAR(80),
    provider_error      TEXT,
    provider_metadata   JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_metadata) = 'object'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_omnichat_generation_jobs_owner_created
    ON omnichat_generation_jobs(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omnichat_generation_jobs_queue
    ON omnichat_generation_jobs(status, created_at)
    WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_omnichat_generation_jobs_conversation
    ON omnichat_generation_jobs(conversation_id, created_at DESC)
    WHERE conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS omnichat_media_assets (
    id                  UUID PRIMARY KEY,
    owner_user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id          INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    conversation_id     INTEGER REFERENCES bot_conversations(id) ON DELETE SET NULL,
    source_message_id   INTEGER REFERENCES bot_messages(id) ON DELETE SET NULL,
    generation_job_id   UUID NOT NULL UNIQUE REFERENCES omnichat_generation_jobs(id) ON DELETE CASCADE,
    media_file_id       INTEGER NOT NULL UNIQUE REFERENCES media_files(id) ON DELETE RESTRICT,
    kind                VARCHAR(10) NOT NULL CHECK (kind IN ('image', 'video')),
    visibility          VARCHAR(10) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    prompt              TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 2000),
    scene_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scene_snapshot) = 'object'),
    width               INTEGER CHECK (width IS NULL OR width > 0),
    height              INTEGER CHECK (height IS NULL OR height > 0),
    duration_seconds    INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    safety_status       VARCHAR(16) NOT NULL DEFAULT 'pending'
                            CHECK (safety_status IN ('pending', 'approved', 'rejected', 'review')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_omnichat_media_assets_owner_created
    ON omnichat_media_assets(owner_user_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_omnichat_media_assets_persona_created
    ON omnichat_media_assets(persona_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_omnichat_media_assets_public
    ON omnichat_media_assets(created_at DESC)
    WHERE visibility = 'public' AND safety_status = 'approved' AND deleted_at IS NULL;

ALTER TABLE omnichat_generation_jobs
    ADD CONSTRAINT omnichat_generation_jobs_source_asset_fk
    FOREIGN KEY (source_asset_id) REFERENCES omnichat_media_assets(id) ON DELETE SET NULL;

ALTER TABLE omnichat_generation_jobs
    ADD CONSTRAINT omnichat_generation_jobs_output_asset_fk
    FOREIGN KEY (output_asset_id) REFERENCES omnichat_media_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS bot_message_attachments (
    message_id      INTEGER NOT NULL REFERENCES bot_messages(id) ON DELETE CASCADE,
    asset_id        UUID NOT NULL REFERENCES omnichat_media_assets(id) ON DELETE RESTRICT,
    position        SMALLINT NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, asset_id),
    UNIQUE (message_id, position)
);

CREATE INDEX IF NOT EXISTS idx_bot_message_attachments_asset
    ON bot_message_attachments(asset_id);
