ALTER TABLE users
  ADD COLUMN plan VARCHAR(20) NOT NULL DEFAULT 'free',
  ADD COLUMN plan_expires_at TIMESTAMPTZ;

CREATE INDEX idx_users_plan_expires_at ON users(plan_expires_at)
  WHERE plan != 'free' AND plan_expires_at IS NOT NULL;
