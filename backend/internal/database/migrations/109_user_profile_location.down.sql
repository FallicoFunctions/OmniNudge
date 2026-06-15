ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_location_length_check;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS location;
