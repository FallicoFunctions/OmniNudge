ALTER TABLE bot_conversations
DROP COLUMN IF EXISTS settings_user_name,
DROP COLUMN IF EXISTS settings_user_age,
DROP COLUMN IF EXISTS settings_user_gender;
