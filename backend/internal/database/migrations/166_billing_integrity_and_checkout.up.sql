-- Forward-only billing hardening for installations that already applied the
-- original OmniCredits and generation migrations.

CREATE OR REPLACE FUNCTION prevent_omnicredits_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Permit only the FK-cascade path initiated by deletion of the parent user.
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'omnicredits ledger is append-only';
END;
$$;

ALTER TABLE omnicredits_wallets
    ADD COLUMN IF NOT EXISTS subscription_epoch UUID;

UPDATE omnicredits_wallets
SET subscription_epoch = gen_random_uuid()
WHERE subscription_epoch IS NULL
  AND subscription_balance > 0
  AND subscription_expires_at > NOW();

ALTER TABLE omnicredits_usage_reservations
    ADD COLUMN IF NOT EXISTS subscription_epoch UUID;

UPDATE omnicredits_usage_reservations AS reservation
SET subscription_epoch = wallet.subscription_epoch
FROM omnicredits_wallets AS wallet
WHERE reservation.user_id = wallet.user_id
  AND reservation.subscription_debited > 0
  AND reservation.subscription_epoch IS NULL
  AND wallet.subscription_epoch IS NOT NULL;

ALTER TABLE omnicredits_usage_reservations
    DROP CONSTRAINT IF EXISTS omnicredits_usage_reservations_subscription_epoch_check,
    ADD CONSTRAINT omnicredits_usage_reservations_subscription_epoch_check
        CHECK (subscription_debited = 0 OR subscription_epoch IS NOT NULL)
        NOT VALID;

CREATE INDEX IF NOT EXISTS idx_omnicredits_usage_reservations_reconcile
    ON omnicredits_usage_reservations(updated_at, user_id, operation_id)
    WHERE status = 'reserved';

ALTER TABLE omnichat_speech_audio
    ADD COLUMN IF NOT EXISTS billing_operation_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichat_speech_audio_billing_operation
    ON omnichat_speech_audio(owner_user_id, billing_operation_id)
    WHERE billing_operation_id IS NOT NULL;

ALTER TABLE omnichat_speech_audio
    DROP CONSTRAINT IF EXISTS omnichat_speech_audio_billing_operation_fk,
    ADD CONSTRAINT omnichat_speech_audio_billing_operation_fk
        FOREIGN KEY (owner_user_id, billing_operation_id)
        REFERENCES omnicredits_usage_reservations(user_id, operation_id)
        NOT VALID;

ALTER TABLE omnichat_generation_jobs
    ADD COLUMN IF NOT EXISTS billing_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Jobs created before paid generation was enforced are explicitly
-- grandfathered. Flip the default before creating the constraint so every new
-- job is fail-closed without fabricating a charge for historical rows.
ALTER TABLE omnichat_generation_jobs
    ALTER COLUMN billing_required SET DEFAULT TRUE;

ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_video_billing_check,
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_billing_check,
    ADD CONSTRAINT omnichat_generation_jobs_billing_check
        CHECK (
            kind NOT IN ('image', 'video')
            OR billing_required = FALSE
            OR billing_operation_id IS NOT NULL
        )
        NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichat_generation_jobs_billing_operation
    ON omnichat_generation_jobs(owner_user_id, billing_operation_id)
    WHERE billing_operation_id IS NOT NULL;

ALTER TABLE omnichat_generation_jobs
    DROP CONSTRAINT IF EXISTS omnichat_generation_jobs_billing_operation_fk,
    ADD CONSTRAINT omnichat_generation_jobs_billing_operation_fk
        FOREIGN KEY (owner_user_id, billing_operation_id)
        REFERENCES omnicredits_usage_reservations(user_id, operation_id)
        NOT VALID;

ALTER TABLE omnichat_generation_jobs
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE omnichat_generation_jobs
SET last_activity_at=COALESCE(completed_at,started_at,created_at,NOW())
WHERE last_activity_at IS NULL;

ALTER TABLE omnichat_generation_jobs
    ALTER COLUMN last_activity_at SET DEFAULT NOW(),
    ALTER COLUMN last_activity_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omnichat_generation_jobs_stale_active
    ON omnichat_generation_jobs(status,last_activity_at)
    WHERE status IN ('queued','running');

ALTER TABLE crypto_payments
    ADD COLUMN IF NOT EXISTS entitlement_applied_at TIMESTAMPTZ;

CREATE TABLE omnichat_checkout_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_idempotency_id UUID NOT NULL,
    offer_id VARCHAR(100) NOT NULL,
    offer_kind VARCHAR(16) NOT NULL CHECK (offer_kind IN ('credits', 'subscription')),
    expected_price_cents BIGINT NOT NULL CHECK (expected_price_cents > 0),
    currency CHAR(3) NOT NULL CHECK (currency = UPPER(currency)),
    credits BIGINT NOT NULL CHECK (credits > 0),
    plan VARCHAR(20),
    period_days INTEGER,
    provider VARCHAR(64),
    provider_session_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'provider_created', 'fulfilled', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fulfilled_at TIMESTAMPTZ,
    UNIQUE (user_id, client_idempotency_id),
    CHECK (
        (offer_kind = 'credits' AND plan IS NULL AND period_days IS NULL)
        OR
        (offer_kind = 'subscription' AND plan IN ('plus', 'premium') AND period_days > 0)
    ),
    CHECK ((status = 'fulfilled') = (fulfilled_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_omnichat_checkout_provider_session
    ON omnichat_checkout_sessions(provider, provider_session_id)
    WHERE provider IS NOT NULL AND provider_session_id IS NOT NULL;

CREATE TABLE omnichat_billing_events (
    provider VARCHAR(64) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    checkout_id UUID NOT NULL REFERENCES omnichat_checkout_sessions(id) ON DELETE RESTRICT,
    payload_sha256 CHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, event_id)
);
