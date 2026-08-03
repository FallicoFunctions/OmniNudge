DROP INDEX IF EXISTS idx_omnichat_publication_reports_queue;
ALTER TABLE omnichat_publication_reports
    DROP COLUMN IF EXISTS resolution,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed_by;

DROP INDEX IF EXISTS uq_omnichat_group_user_message_request;
ALTER TABLE omnichat_group_messages
    DROP COLUMN IF EXISTS batch_position,
    DROP COLUMN IF EXISTS client_request_id;

DROP INDEX IF EXISTS uq_bot_conversations_continue_request;
ALTER TABLE bot_conversations DROP COLUMN IF EXISTS continue_request_id;

DROP INDEX IF EXISTS uq_omnichat_publications_author_request;
ALTER TABLE omnichat_publications DROP COLUMN IF EXISTS client_request_id;
