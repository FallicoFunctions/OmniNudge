-- Rollback: 001_initial_schema
-- Drop tables in reverse order of creation (respecting foreign keys)

DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS media_files;
DROP TABLE IF EXISTS reddit_posts;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS blocked_users;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS users;
