ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS wall_post_permission TEXT NOT NULL DEFAULT 'all_friends';

ALTER TABLE user_settings
    ADD CONSTRAINT user_settings_wall_post_permission_check
    CHECK (wall_post_permission IN ('all_friends', 'requires_approval', 'no_one'));
