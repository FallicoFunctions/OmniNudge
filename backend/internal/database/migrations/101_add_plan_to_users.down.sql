DROP INDEX IF EXISTS idx_users_plan_expires_at;

ALTER TABLE users
  DROP COLUMN IF EXISTS plan,
  DROP COLUMN IF EXISTS plan_expires_at;
