DELETE FROM omnichat_request_idempotency WHERE scope IN ('omniai_create', 'roleplay_create');

ALTER TABLE omnichat_request_idempotency
    DROP CONSTRAINT IF EXISTS omnichat_request_idempotency_scope_check;

ALTER TABLE omnichat_request_idempotency
    ADD CONSTRAINT omnichat_request_idempotency_scope_check
    CHECK (scope IN ('chat_send', 'chat_regenerate', 'media_generation', 'media_command'));
