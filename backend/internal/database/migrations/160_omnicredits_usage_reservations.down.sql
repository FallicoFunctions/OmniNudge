DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM omnicredits_usage_reservations) THEN
        RAISE EXCEPTION 'cannot roll back OmniCredits reservations while accounting records remain';
    END IF;
    IF EXISTS (SELECT 1 FROM omnicredits_ledger WHERE entry_type = 'usage_refund') THEN
        RAISE EXCEPTION 'cannot roll back OmniCredits reservations while refund ledger entries remain';
    END IF;
END;
$$;

DROP TABLE IF EXISTS omnicredits_usage_reservations;

ALTER TABLE omnicredits_ledger
    DROP CONSTRAINT omnicredits_ledger_entry_shape_check,
    DROP CONSTRAINT omnicredits_ledger_entry_type_check;

ALTER TABLE omnicredits_ledger
    ADD CONSTRAINT omnicredits_ledger_entry_type_check
        CHECK (entry_type IN ('purchase', 'subscription_grant', 'subscription_expiry', 'usage_debit')),
    ADD CONSTRAINT omnicredits_ledger_entry_shape_check CHECK (
        (entry_type = 'purchase' AND purchased_delta > 0 AND subscription_delta = 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
        OR (entry_type = 'subscription_grant' AND purchased_delta = 0 AND subscription_delta > 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NOT NULL AND subscription_expires_at IS NOT NULL)
        OR (entry_type = 'subscription_expiry' AND purchased_delta = 0 AND subscription_delta < 0 AND usage_kind IS NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
        OR (entry_type = 'usage_debit' AND purchased_delta <= 0 AND subscription_delta <= 0 AND (purchased_delta < 0 OR subscription_delta < 0) AND usage_kind IS NOT NULL AND subscription_requested_expires_at IS NULL AND subscription_expires_at IS NULL)
    );
