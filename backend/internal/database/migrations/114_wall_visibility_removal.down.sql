ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS wall_visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_wall_visibility_check
    CHECK (wall_visibility IN ('public', 'friends_only', 'private'));
