-- Optional free-text location field shown on the profile's info card.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_location_length_check
    CHECK (location IS NULL OR char_length(location) <= 100);
