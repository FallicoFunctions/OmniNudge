DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM omnichat_billing_events)
       OR EXISTS (SELECT 1 FROM omnichat_checkout_sessions) THEN
        RAISE EXCEPTION 'cannot roll back billing integrity while checkout records remain';
    END IF;
    IF EXISTS (SELECT 1 FROM omnichat_generation_jobs WHERE billing_operation_id IS NOT NULL)
       OR EXISTS (SELECT 1 FROM omnichat_speech_audio WHERE billing_operation_id IS NOT NULL)
       OR EXISTS (SELECT 1 FROM omnicredits_wallets WHERE subscription_epoch IS NOT NULL)
       OR EXISTS (SELECT 1 FROM omnicredits_usage_reservations WHERE subscription_epoch IS NOT NULL) THEN
        RAISE EXCEPTION 'cannot roll back billing integrity while linked accounting records remain';
    END IF;
END;
$$;

DROP TABLE IF EXISTS omnichat_billing_events;
DROP TABLE IF EXISTS omnichat_checkout_sessions;

ALTER TABLE crypto_payments
    DROP COLUMN IF EXISTS entitlement_applied_at;

ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_billing_operation_fk,
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_billing_check;
DROP INDEX IF EXISTS uq_omnichat_generation_jobs_billing_operation;
DROP INDEX IF EXISTS idx_omnichat_generation_jobs_stale_active;
ALTER TABLE omnichat_generation_jobs
    ADD CONSTRAINT omnichat_generation_jobs_video_billing_check
        CHECK (kind <> 'video' OR billing_operation_id IS NOT NULL);
ALTER TABLE omnichat_generation_jobs
    DROP COLUMN IF EXISTS last_activity_at,
    DROP COLUMN IF EXISTS billing_required;

ALTER TABLE omnichat_speech_audio
    DROP CONSTRAINT IF EXISTS omnichat_speech_audio_billing_operation_fk;
DROP INDEX IF EXISTS uq_omnichat_speech_audio_billing_operation;
ALTER TABLE omnichat_speech_audio
    DROP COLUMN IF EXISTS billing_operation_id;

DROP INDEX IF EXISTS idx_omnicredits_usage_reservations_reconcile;
ALTER TABLE omnicredits_usage_reservations
    DROP CONSTRAINT IF EXISTS omnicredits_usage_reservations_subscription_epoch_check,
    DROP COLUMN IF EXISTS subscription_epoch;

ALTER TABLE omnicredits_wallets
    DROP COLUMN IF EXISTS subscription_epoch;

CREATE OR REPLACE FUNCTION prevent_omnicredits_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'omnicredits ledger is append-only';
END;
$$;
