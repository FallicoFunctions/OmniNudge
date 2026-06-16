ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS top_friends_json TEXT;

-- Length guard on banner_url, consistent with the bio/status_text constraints in migration 066.
-- Note: ADD CONSTRAINT does not support IF NOT EXISTS; this migration runs exactly once.
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_banner_url_length_check
  CHECK (char_length(COALESCE(banner_url, '')) <= 2048);
