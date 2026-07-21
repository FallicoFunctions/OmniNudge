DROP TABLE IF EXISTS bot_message_attachments;

ALTER TABLE IF EXISTS omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_output_asset_fk,
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_source_asset_fk;

DROP TABLE IF EXISTS omnichat_media_assets;
DROP TABLE IF EXISTS omnichat_generation_jobs;

ALTER TABLE bot_conversations
    DROP CONSTRAINT IF EXISTS bot_conversations_scene_state_object,
    DROP COLUMN IF EXISTS scene_state;
