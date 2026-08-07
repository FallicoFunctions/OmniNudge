-- Reverting narrows the allowed scopes again. Any media_command claims must go
-- first or the restored constraint cannot be validated.
DELETE FROM omnichat_request_idempotency WHERE scope = 'media_command';

ALTER TABLE omnichat_request_idempotency
    DROP CONSTRAINT IF EXISTS omnichat_request_idempotency_scope_check;

ALTER TABLE omnichat_request_idempotency
    ADD CONSTRAINT omnichat_request_idempotency_scope_check
    CHECK (scope IN ('chat_send', 'chat_regenerate', 'media_generation'));
