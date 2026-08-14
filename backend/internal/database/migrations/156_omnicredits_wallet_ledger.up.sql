-- OmniCredits are accounted for in two separate buckets. Purchased credits do
-- not expire; subscription grants do. The ledger is append-only at the
-- application layer and supplies a durable audit trail for every balance move.
CREATE TABLE omnicredits_wallets (
    user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    purchased_balance    BIGINT NOT NULL DEFAULT 0 CHECK (purchased_balance >= 0),
    subscription_balance BIGINT NOT NULL DEFAULT 0 CHECK (subscription_balance >= 0),
    subscription_expires_at TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE omnicredits_ledger (
    id                   BIGSERIAL PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation_id         UUID NOT NULL,
    entry_type           VARCHAR(32) NOT NULL CHECK (entry_type IN ('purchase', 'subscription_grant', 'subscription_expiry', 'usage_debit')),
    usage_kind           VARCHAR(64),
    purchased_delta      BIGINT NOT NULL DEFAULT 0,
    subscription_delta   BIGINT NOT NULL DEFAULT 0,
    subscription_requested_expires_at TIMESTAMPTZ,
    subscription_expires_at TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT omnicredits_ledger_entry_shape_check CHECK (
        (entry_type = 'purchase' AND purchased_delta > 0 AND subscription_delta = 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
        OR (entry_type = 'subscription_grant' AND purchased_delta = 0 AND subscription_delta > 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NOT NULL AND subscription_expires_at IS NOT NULL)
        OR (entry_type = 'subscription_expiry' AND purchased_delta = 0 AND subscription_delta < 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
        OR (entry_type = 'usage_debit' AND purchased_delta <= 0 AND subscription_delta <= 0 AND (purchased_delta < 0 OR subscription_delta < 0) AND usage_kind IS NOT NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
    ),
    CONSTRAINT omnicredits_ledger_operation_unique UNIQUE (user_id, operation_id)
);

CREATE INDEX idx_omnicredits_ledger_user_created_at
    ON omnicredits_ledger(user_id, created_at DESC, id DESC);

-- Enforce append-only accounting even if a future code path accidentally uses
-- UPDATE or DELETE instead of issuing a compensating ledger entry.
CREATE FUNCTION prevent_omnicredits_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'omnicredits ledger is append-only';
END;
$$;

CREATE TRIGGER omnicredits_ledger_no_update
    BEFORE UPDATE ON omnicredits_ledger
    FOR EACH ROW EXECUTE FUNCTION prevent_omnicredits_ledger_mutation();

CREATE TRIGGER omnicredits_ledger_no_delete
    BEFORE DELETE ON omnicredits_ledger
    FOR EACH ROW EXECUTE FUNCTION prevent_omnicredits_ledger_mutation();
