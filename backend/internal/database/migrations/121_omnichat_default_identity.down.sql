ALTER TABLE user_settings
  DROP COLUMN IF EXISTS omnichat_default_user_gender,
  DROP COLUMN IF EXISTS omnichat_default_user_age,
  DROP COLUMN IF EXISTS omnichat_default_user_name;
