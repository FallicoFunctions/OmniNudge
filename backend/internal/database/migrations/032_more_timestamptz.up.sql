-- Convert remaining TIMESTAMP columns to TIMESTAMPTZ for consistent UTC storage

-- Users OAuth token expiry
ALTER TABLE IF EXISTS users
  ALTER COLUMN token_expires_at TYPE TIMESTAMPTZ USING token_expires_at AT TIME ZONE 'UTC';

-- Post comments
ALTER TABLE IF EXISTS post_comments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN edited_at TYPE TIMESTAMPTZ USING edited_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS post_comments
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Conversations / messages / blocking
ALTER TABLE IF EXISTS conversations
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN last_message_at TYPE TIMESTAMPTZ USING last_message_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS conversations
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN last_message_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS messages
  ALTER COLUMN sent_at TYPE TIMESTAMPTZ USING sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN delivered_at TYPE TIMESTAMPTZ USING delivered_at AT TIME ZONE 'UTC',
  ALTER COLUMN read_at TYPE TIMESTAMPTZ USING read_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS messages
  ALTER COLUMN sent_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS blocked_users
  ALTER COLUMN blocked_at TYPE TIMESTAMPTZ USING blocked_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS blocked_users
  ALTER COLUMN blocked_at SET DEFAULT NOW();

-- Notifications
ALTER TABLE IF EXISTS notifications
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS notifications
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS notification_batches
  ALTER COLUMN scheduled_for TYPE TIMESTAMPTZ USING scheduled_for AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN processed_at TYPE TIMESTAMPTZ USING processed_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS notification_batches
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Saved / hidden content
ALTER TABLE IF EXISTS saved_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS saved_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS saved_reddit_comments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS saved_reddit_comments
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS saved_reddit_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS saved_reddit_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS hidden_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS hidden_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS hidden_reddit_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS hidden_reddit_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Subscriptions
ALTER TABLE IF EXISTS hub_subscriptions
  ALTER COLUMN subscribed_at TYPE TIMESTAMPTZ USING subscribed_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS hub_subscriptions
  ALTER COLUMN subscribed_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS subreddit_subscriptions
  ALTER COLUMN subscribed_at TYPE TIMESTAMPTZ USING subscribed_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS subreddit_subscriptions
  ALTER COLUMN subscribed_at SET DEFAULT NOW();

-- Vote activity / baselines
ALTER TABLE IF EXISTS vote_activity
  ALTER COLUMN hour_bucket TYPE TIMESTAMPTZ USING hour_bucket AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS vote_activity
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS user_baselines
  ALTER COLUMN last_calculated_at TYPE TIMESTAMPTZ USING last_calculated_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS user_baselines
  ALTER COLUMN last_calculated_at SET DEFAULT NOW();

-- Reports
ALTER TABLE IF EXISTS reports
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS reports
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Media files
ALTER TABLE IF EXISTS media_files
  ALTER COLUMN uploaded_at TYPE TIMESTAMPTZ USING uploaded_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS media_files
  ALTER COLUMN uploaded_at SET DEFAULT NOW();

-- Invitations
ALTER TABLE IF EXISTS invitations
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN accepted_at TYPE TIMESTAMPTZ USING accepted_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS invitations
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Reddit posts cache
ALTER TABLE IF EXISTS reddit_posts
  ALTER COLUMN created_utc TYPE TIMESTAMPTZ USING created_utc AT TIME ZONE 'UTC',
  ALTER COLUMN cached_at TYPE TIMESTAMPTZ USING cached_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS reddit_posts
  ALTER COLUMN cached_at SET DEFAULT NOW();

-- Slideshow
ALTER TABLE IF EXISTS slideshow_sessions
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS slideshow_sessions
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS slideshow_media_items
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS slideshow_media_items
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Theme customization tables
ALTER TABLE IF EXISTS predefined_themes
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS predefined_themes
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS user_theme_edits
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS user_theme_edits
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS user_theme_variants
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS user_theme_variants
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS user_theme_purchases
  ALTER COLUMN purchased_at TYPE TIMESTAMPTZ USING purchased_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS user_theme_purchases
  ALTER COLUMN purchased_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS user_installed_themes
  ALTER COLUMN installed_at TYPE TIMESTAMPTZ USING installed_at AT TIME ZONE 'UTC',
  ALTER COLUMN last_used_at TYPE TIMESTAMPTZ USING last_used_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS user_installed_themes
  ALTER COLUMN installed_at SET DEFAULT NOW();

ALTER TABLE IF EXISTS theme_ratings
  ALTER COLUMN reviewed_at TYPE TIMESTAMPTZ USING reviewed_at AT TIME ZONE 'UTC';

-- Reddit post comments (local copies)
ALTER TABLE IF EXISTS reddit_post_comments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';
ALTER TABLE IF EXISTS reddit_post_comments
  ALTER COLUMN created_at SET DEFAULT NOW();
