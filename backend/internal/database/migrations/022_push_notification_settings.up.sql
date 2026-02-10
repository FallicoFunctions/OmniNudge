-- Add push notification preference to user_settings (P0-042)
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS show_push_notifications BOOLEAN DEFAULT TRUE NOT NULL;

-- Add comment
COMMENT ON COLUMN user_settings.show_push_notifications IS 'Whether the user wants to receive push notifications when offline';
