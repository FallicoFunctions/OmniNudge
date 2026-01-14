-- Extend user_settings table with notification preferences
ALTER TABLE user_settings
ADD COLUMN notify_comment_replies BOOLEAN DEFAULT TRUE,
ADD COLUMN notify_post_milestone BOOLEAN DEFAULT TRUE,
ADD COLUMN notify_post_velocity BOOLEAN DEFAULT TRUE,
ADD COLUMN notify_comment_milestone BOOLEAN DEFAULT TRUE,
ADD COLUMN notify_comment_velocity BOOLEAN DEFAULT TRUE,
ADD COLUMN daily_digest BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_settings.notify_comment_replies IS 'Notify when someone replies to user comments or posts';
COMMENT ON COLUMN user_settings.notify_post_milestone IS 'Notify when posts reach milestone upvote counts (10, 50, 100, etc.)';
COMMENT ON COLUMN user_settings.notify_post_velocity IS 'Notify when posts get unusual upvote velocity';
COMMENT ON COLUMN user_settings.notify_comment_milestone IS 'Notify when comments reach milestone upvote counts';
COMMENT ON COLUMN user_settings.notify_comment_velocity IS 'Notify when comments get unusual upvote velocity';
COMMENT ON COLUMN user_settings.daily_digest IS 'Send daily digest of notifications instead of real-time (future feature)';
