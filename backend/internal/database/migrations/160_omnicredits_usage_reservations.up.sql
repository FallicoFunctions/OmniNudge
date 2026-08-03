ALTER TABLE omnicredits_ledger
    DROP CONSTRAINT omnicredits_ledger_entry_shape_check,
    DROP CONSTRAINT omnicredits_ledger_entry_type_check;

ALTER TABLE omnicredits_ledger
    ADD CONSTRAINT omnicredits_ledger_entry_type_check
        CHECK (entry_type IN ('purchase', 'subscription_grant', 'subscription_expiry', 'usage_debit', 'usage_refund')),
    ADD CONSTRAINT omnicredits_ledger_entry_shape_check CHECK (
        (entry_type = 'purchase' AND purchased_delta > 0 AND subscription_delta = 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
        OR (entry_type = 'subscription_grant' AND purchased_delta = 0 AND subscription_delta > 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NOT NULL AND subscription_expires_at IS NOT NULL)
        OR (entry_type = 'subscription_expiry' AND purchased_delta = 0 AND subscription_delta < 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
        OR (entry_type = 'usage_debit' AND purchased_delta <= 0 AND subscription_delta <= 0 AND (purchased_delta < 0 OR subscription_delta < 0) AND usage_kind IS NOT NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
        OR (entry_type = 'usage_refund' AND purchased_delta >= 0 AND subscription_delta >= 0 AND (purchased_delta > 0 OR subscription_delta > 0) AND usage_kind IS NOT NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
    );

CREATE TABLE omnicredits_usage_reservations (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    usage_kind VARCHAR(64) NOT NULL,
    cost BIGINT NOT NULL CHECK (cost > 0),
    purchased_debited BIGINT NOT NULL CHECK (purchased_debited >= 0),
    subscription_debited BIGINT NOT NULL CHECK (subscription_debited >= 0),
    status VARCHAR(16) NOT NULL CHECK (status IN ('reserved', 'captured', 'refunded')),
    refund_operation_id UUID UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, operation_id),
    CHECK (purchased_debited + subscription_debited = cost),
    CHECK ((status = 'refunded') = (refund_operation_id IS NOT NULL))
);

CREATE INDEX idx_omnicredits_usage_reservations_user_status
    ON omnicredits_usage_reservations (user_id, status, created_at);
