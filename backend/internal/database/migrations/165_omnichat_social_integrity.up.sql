-- Social integrity and moderation workflow hardening.

ALTER TABLE omnichat_publications
    ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichat_publications_author_request
    ON omnichat_publications(author_user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

ALTER TABLE bot_conversations
    ADD COLUMN IF NOT EXISTS continue_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_conversations_continue_request
    ON bot_conversations(user_id, continue_request_id)
    WHERE continue_request_id IS NOT NULL;

ALTER TABLE omnichat_group_messages
    ADD COLUMN IF NOT EXISTS client_request_id UUID,
    ADD COLUMN IF NOT EXISTS batch_position SMALLINT NOT NULL DEFAULT 0
        CHECK (batch_position BETWEEN 0 AND 3);

CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichat_group_user_message_request
    ON omnichat_group_messages(group_id, sender_user_id, client_request_id)
    WHERE sender_type = 'user' AND client_request_id IS NOT NULL;

ALTER TABLE omnichat_publication_reports
    ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolution VARCHAR(16)
        CHECK (resolution IS NULL OR resolution IN ('removed', 'dismissed'));

CREATE INDEX IF NOT EXISTS idx_omnichat_publication_reports_queue
    ON omnichat_publication_reports(created_at, id)
    WHERE status IN ('open', 'reviewing');
