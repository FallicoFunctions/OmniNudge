UPDATE user_settings SET profile_visibility = 'private' WHERE profile_visibility = 'friends_only';

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_profile_visibility_check;
ALTER TABLE user_settings
    ADD CONSTRAINT user_settings_profile_visibility_check
    CHECK (profile_visibility IN ('public', 'private'));
