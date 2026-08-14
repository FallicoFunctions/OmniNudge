DROP INDEX IF EXISTS uq_bot_messages_user_turn_request;
ALTER TABLE bot_messages DROP COLUMN IF EXISTS client_request_id;

DROP TABLE IF EXISTS omnichat_request_idempotency;
