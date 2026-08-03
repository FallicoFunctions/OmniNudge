-- Durable replay protection for paid or quota-limited chat and media actions.
-- A client UUID is unique per user across all scopes, preventing it from being
-- replayed against a different conversation, message, or media request.
CREATE TABLE omnichat_request_idempotency (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_request_id UUID NOT NULL,
    scope VARCHAR(40) NOT NULL CHECK (scope IN ('chat_send', 'chat_regenerate', 'media_generation')),
    resource_key VARCHAR(160) NOT NULL,
    payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    response_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, client_request_id),
    CHECK ((status = 'completed') = (response_json IS NOT NULL))
);

CREATE INDEX idx_omnichat_request_idempotency_pending
    ON omnichat_request_idempotency(updated_at)
    WHERE status = 'pending';

-- A failed request can have persisted its user turn before the provider call.
-- Binding that turn to the same client UUID makes retries resume the turn
-- rather than append an identical message.
ALTER TABLE bot_messages
    ADD COLUMN client_request_id UUID;

CREATE UNIQUE INDEX uq_bot_messages_user_turn_request
    ON bot_messages(conversation_id, client_request_id)
    WHERE role = 'user' AND client_request_id IS NOT NULL;
