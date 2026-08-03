-- Persist every successfully delivered credit-backed chat response. A message
-- may be regenerated more than once, so this is an append-only one-row-per-
-- operation relation rather than a replaceable column on bot_messages.

CREATE TABLE omnichat_chat_billing_deliveries (
    user_id INTEGER NOT NULL,
    operation_id UUID NOT NULL,
    message_id INTEGER REFERENCES bot_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, operation_id),
    FOREIGN KEY (user_id, operation_id)
        REFERENCES omnicredits_usage_reservations(user_id, operation_id)
        ON DELETE CASCADE
        NOT VALID
);

CREATE INDEX idx_omnichat_chat_billing_deliveries_message
    ON omnichat_chat_billing_deliveries(message_id);
