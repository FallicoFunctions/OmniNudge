CREATE TABLE crypto_payments (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  txid                  VARCHAR(128) NOT NULL,
  coin                  VARCHAR(10) NOT NULL,           -- 'BTC', 'ETH', 'CAH'
  usd_price_at_submit   NUMERIC(12, 4) NOT NULL,        -- coin price in USD at submission time
  amount_received       NUMERIC(36, 18) NOT NULL,       -- raw coin amount (ETH/CAH have 18 decimals)
  usd_value             NUMERIC(12, 4) NOT NULL,        -- amount_received * usd_price_at_submit
  plan_months           INTEGER NOT NULL DEFAULT 1,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | confirmed | failed | insufficient
  confirmations         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at          TIMESTAMPTZ,

  CONSTRAINT crypto_payments_txid_coin_unique UNIQUE (txid, coin),
  CONSTRAINT crypto_payments_coin_check CHECK (coin IN ('BTC', 'ETH', 'CAH')),
  CONSTRAINT crypto_payments_status_check CHECK (status IN ('pending', 'confirmed', 'failed', 'insufficient')),
  CONSTRAINT crypto_payments_plan_months_check CHECK (plan_months >= 1)
);

CREATE INDEX idx_crypto_payments_status_pending ON crypto_payments(created_at)
  WHERE status = 'pending';

CREATE INDEX idx_crypto_payments_user_id ON crypto_payments(user_id);
