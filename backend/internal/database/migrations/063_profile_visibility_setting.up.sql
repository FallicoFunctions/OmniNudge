ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'user_settings_profile_visibility_check'
	) THEN
		ALTER TABLE user_settings
		ADD CONSTRAINT user_settings_profile_visibility_check
		CHECK (profile_visibility IN ('public', 'friends_only', 'private'));
	END IF;
END $$;
