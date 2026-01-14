-- Drop all tables in reverse dependency order

-- Drop junction/mapping tables first
DROP TABLE IF EXISTS post_votes CASCADE;
DROP TABLE IF EXISTS comment_votes CASCADE;
DROP TABLE IF EXISTS user_blocked_users CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS notification_settings CASCADE;
DROP TABLE IF EXISTS hub_subscriptions CASCADE;
DROP TABLE IF EXISTS hub_moderators CASCADE;
DROP TABLE IF EXISTS saved_posts CASCADE;
DROP TABLE IF EXISTS saved_reddit_posts CASCADE;
DROP TABLE IF EXISTS saved_post_comments CASCADE;
DROP TABLE IF EXISTS saved_reddit_comments CASCADE;
DROP TABLE IF EXISTS hidden_posts CASCADE;
DROP TABLE IF EXISTS hidden_reddit_posts CASCADE;
DROP TABLE IF EXISTS slideshow_media_items CASCADE;
DROP TABLE IF EXISTS user_keys CASCADE;
DROP TABLE IF EXISTS reports CASCADE;

-- Drop main data tables
DROP TABLE IF EXISTS slideshow_sessions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS media_files CASCADE;
DROP TABLE IF EXISTS post_comments CASCADE;
DROP TABLE IF EXISTS platform_posts CASCADE;
DROP TABLE IF EXISTS hubs CASCADE;
DROP TABLE IF EXISTS hub_settings CASCADE;
DROP TABLE IF EXISTS hub_themes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS pg_trgm;

-- Drop types
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS conversation_type CASCADE;
DROP TYPE IF EXISTS message_type CASCADE;
DROP TYPE IF EXISTS privacy_type CASCADE;
DROP TYPE IF EXISTS spam_filter_strength CASCADE;
DROP TYPE IF EXISTS moderator_role CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
