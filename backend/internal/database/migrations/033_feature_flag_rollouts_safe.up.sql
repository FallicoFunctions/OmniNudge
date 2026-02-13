-- Ensure rollout/rollback columns exist even if earlier migration state is inconsistent.
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS auto_rollback BOOLEAN DEFAULT FALSE;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS rollback JSONB;

