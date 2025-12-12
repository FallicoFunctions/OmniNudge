-- Convert remaining TIMESTAMP columns to TIMESTAMPTZ for consistent UTC storage

-- Users OAuth token expiry
ALTER TABLE users
  ALTER COLUMN token_expires_at TYPE TIMESTAMPTZ USING token_expires_at AT TIME ZONE 'UTC';

-- Post comments
ALTER TABLE post_comments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN edited_at TYPE TIMESTAMPTZ USING edited_at AT TIME ZONE 'UTC';
ALTER TABLE post_comments
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Conversations / messages / blocking
ALTER TABLE conversations
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN last_message_at TYPE TIMESTAMPTZ USING last_message_at AT TIME ZONE 'UTC';
ALTER TABLE conversations
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN last_message_at SET DEFAULT NOW();

ALTER TABLE messages
  ALTER COLUMN sent_at TYPE TIMESTAMPTZ USING sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN delivered_at TYPE TIMESTAMPTZ USING delivered_at AT TIME ZONE 'UTC',
  ALTER COLUMN read_at TYPE TIMESTAMPTZ USING read_at AT TIME ZONE 'UTC';
ALTER TABLE messages
  ALTER COLUMN sent_at SET DEFAULT NOW();

ALTER TABLE blocked_users
  ALTER COLUMN blocked_at TYPE TIMESTAMPTZ USING blocked_at AT TIME ZONE 'UTC';
ALTER TABLE blocked_users
  ALTER COLUMN blocked_at SET DEFAULT NOW();

-- Notifications
ALTER TABLE notifications
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE notifications
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE notification_batches
  ALTER COLUMN scheduled_for TYPE TIMESTAMPTZ USING scheduled_for AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN processed_at TYPE TIMESTAMPTZ USING processed_at AT TIME ZONE 'UTC';
ALTER TABLE notification_batches
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Saved / hidden content
ALTER TABLE saved_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE saved_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE saved_reddit_comments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE saved_reddit_comments
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE saved_reddit_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE saved_reddit_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE hidden_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE hidden_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE hidden_reddit_posts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE hidden_reddit_posts
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Subscriptions
ALTER TABLE hub_subscriptions
  ALTER COLUMN subscribed_at TYPE TIMESTAMPTZ USING subscribed_at AT TIME ZONE 'UTC';
ALTER TABLE hub_subscriptions
  ALTER COLUMN subscribed_at SET DEFAULT NOW();

ALTER TABLE subreddit_subscriptions
  ALTER COLUMN subscribed_at TYPE TIMESTAMPTZ USING subscribed_at AT TIME ZONE 'UTC';
ALTER TABLE subreddit_subscriptions
  ALTER COLUMN subscribed_at SET DEFAULT NOW();

-- Vote activity / baselines
ALTER TABLE vote_activity
  ALTER COLUMN hour_bucket TYPE TIMESTAMPTZ USING hour_bucket AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE vote_activity
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE user_baselines
  ALTER COLUMN last_calculated_at TYPE TIMESTAMPTZ USING last_calculated_at AT TIME ZONE 'UTC';
ALTER TABLE user_baselines
  ALTER COLUMN last_calculated_at SET DEFAULT NOW();

-- Reports
ALTER TABLE reports
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE reports
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Media files
ALTER TABLE media_files
  ALTER COLUMN uploaded_at TYPE TIMESTAMPTZ USING uploaded_at AT TIME ZONE 'UTC';
ALTER TABLE media_files
  ALTER COLUMN uploaded_at SET DEFAULT NOW();

-- Invitations
ALTER TABLE invitations
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN accepted_at TYPE TIMESTAMPTZ USING accepted_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE invitations
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Reddit posts cache
ALTER TABLE reddit_posts
  ALTER COLUMN created_utc TYPE TIMESTAMPTZ USING created_utc AT TIME ZONE 'UTC',
  ALTER COLUMN cached_at TYPE TIMESTAMPTZ USING cached_at AT TIME ZONE 'UTC',
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE reddit_posts
  ALTER COLUMN cached_at SET DEFAULT NOW();

-- Slideshow
ALTER TABLE slideshow_sessions
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE slideshow_sessions
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE slideshow_media_items
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE slideshow_media_items
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Theme customization tables
ALTER TABLE predefined_themes
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE predefined_themes
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE user_theme_edits
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE user_theme_edits
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE user_theme_variants
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE user_theme_variants
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE user_theme_purchases
  ALTER COLUMN purchased_at TYPE TIMESTAMPTZ USING purchased_at AT TIME ZONE 'UTC';
ALTER TABLE user_theme_purchases
  ALTER COLUMN purchased_at SET DEFAULT NOW();

ALTER TABLE user_installed_themes
  ALTER COLUMN installed_at TYPE TIMESTAMPTZ USING installed_at AT TIME ZONE 'UTC',
  ALTER COLUMN last_used_at TYPE TIMESTAMPTZ USING last_used_at AT TIME ZONE 'UTC';
ALTER TABLE user_installed_themes
  ALTER COLUMN installed_at SET DEFAULT NOW();

ALTER TABLE theme_ratings
  ALTER COLUMN reviewed_at TYPE TIMESTAMPTZ USING reviewed_at AT TIME ZONE 'UTC';

-- Reddit post comments (local copies)
ALTER TABLE reddit_post_comments
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';
ALTER TABLE reddit_post_comments
  ALTER COLUMN created_at SET DEFAULT NOW();
