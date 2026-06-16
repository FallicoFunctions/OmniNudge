ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_wall_visibility_check;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS wall_visibility;
