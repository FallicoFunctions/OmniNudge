ALTER TABLE user_settings
  ADD COLUMN omnichat_default_user_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN omnichat_default_user_age TEXT NOT NULL DEFAULT '',
  ADD COLUMN omnichat_default_user_gender TEXT NOT NULL DEFAULT '';
