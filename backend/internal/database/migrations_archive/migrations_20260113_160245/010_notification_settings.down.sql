-- Remove notification preference columns from user_settings
ALTER TABLE user_settings
DROP COLUMN IF EXISTS notify_comment_replies,
DROP COLUMN IF EXISTS notify_post_milestone,
DROP COLUMN IF EXISTS notify_post_velocity,
DROP COLUMN IF EXISTS notify_comment_milestone,
DROP COLUMN IF EXISTS notify_comment_velocity,
DROP COLUMN IF EXISTS daily_digest;
