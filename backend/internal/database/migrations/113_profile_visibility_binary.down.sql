ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_profile_visibility_check;
ALTER TABLE user_settings
    ADD CONSTRAINT user_settings_profile_visibility_check
    CHECK (profile_visibility IN ('public', 'friends_only', 'private'));
-- Note: the friends_only -> private data migration is not reversed.
