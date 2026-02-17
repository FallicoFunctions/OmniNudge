-- Ensure feature flag schema matches service/repository expectations on older installs.

-- feature_flags: add environment for env-scoped queries.
ALTER TABLE feature_flags
ADD COLUMN IF NOT EXISTS environment VARCHAR(50) NOT NULL DEFAULT 'all';

-- feature_flag_overrides: required by GetUserOverride/SetUserOverride paths.
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
    flag_key VARCHAR(255) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (flag_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_user ON feature_flag_overrides(user_id);

-- feature_flag_audit: backfill structured audit columns used by repository/service.
ALTER TABLE feature_flag_audit
ADD COLUMN IF NOT EXISTS change_type VARCHAR(50);

ALTER TABLE feature_flag_audit
ADD COLUMN IF NOT EXISTS old_value JSONB;

ALTER TABLE feature_flag_audit
ADD COLUMN IF NOT EXISTS new_value JSONB;

-- Backfill change_type/new_value from legacy "enabled" column where present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'feature_flag_audit'
      AND column_name = 'enabled'
  ) THEN
    UPDATE feature_flag_audit
    SET change_type = COALESCE(change_type, CASE WHEN enabled THEN 'enabled' ELSE 'disabled' END),
        new_value = COALESCE(new_value, jsonb_build_object('enabled', enabled))
    WHERE change_type IS NULL OR new_value IS NULL;
  ELSE
    UPDATE feature_flag_audit
    SET change_type = COALESCE(change_type, 'updated'),
        new_value = COALESCE(new_value, '{}'::jsonb)
    WHERE change_type IS NULL OR new_value IS NULL;
  END IF;
END $$;

ALTER TABLE feature_flag_audit
ALTER COLUMN change_type SET NOT NULL;
