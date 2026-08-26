-- Recreate the ledger exactly as 168 defined it. It comes back empty: the rows
-- named reservations that were captured on the way up, and inventing them again
-- would assert a payment nobody made.
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
