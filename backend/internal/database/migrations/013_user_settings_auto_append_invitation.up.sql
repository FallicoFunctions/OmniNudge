ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS auto_append_invitation BOOLEAN NOT NULL DEFAULT false;

