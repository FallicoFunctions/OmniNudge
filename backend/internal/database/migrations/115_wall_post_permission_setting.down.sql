ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_wall_post_permission_check;
ALTER TABLE user_settings DROP COLUMN IF EXISTS wall_post_permission;
