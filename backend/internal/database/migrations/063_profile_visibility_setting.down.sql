ALTER TABLE user_settings
DROP CONSTRAINT IF EXISTS user_settings_profile_visibility_check;

ALTER TABLE user_settings
DROP COLUMN IF EXISTS profile_visibility;
