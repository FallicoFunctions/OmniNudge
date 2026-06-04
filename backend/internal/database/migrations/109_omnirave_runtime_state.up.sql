ALTER TABLE omnirave_profiles
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_venue TEXT NOT NULL DEFAULT 'main_stage';
