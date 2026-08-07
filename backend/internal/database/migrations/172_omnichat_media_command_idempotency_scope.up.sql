-- The /photo and /video slash commands claim request idempotency under the
-- scope 'media_command', but migration 169 only allowed 'chat_send',
-- 'chat_regenerate' and 'media_generation'. Every command therefore failed the
-- CHECK constraint on insert, which surfaced to the browser as the generic
-- "Media generation is temporarily unavailable" 503 rather than as a
-- constraint violation. The slash-command path has never worked as a result.
ALTER TABLE omnichat_request_idempotency
    DROP CONSTRAINT IF EXISTS omnichat_request_idempotency_scope_check;

ALTER TABLE omnichat_request_idempotency
    ADD CONSTRAINT omnichat_request_idempotency_scope_check
    CHECK (scope IN ('chat_send', 'chat_regenerate', 'media_generation', 'media_command'));
