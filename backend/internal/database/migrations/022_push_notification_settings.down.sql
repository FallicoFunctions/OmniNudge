-- Rollback push notification settings
ALTER TABLE user_settings
DROP COLUMN IF EXISTS show_push_notifications;
