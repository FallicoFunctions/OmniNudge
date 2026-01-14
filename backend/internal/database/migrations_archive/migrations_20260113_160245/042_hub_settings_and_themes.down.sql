-- Drop theme and settings tables
DROP TABLE IF EXISTS hub_themes CASCADE;
DROP TABLE IF EXISTS hub_settings CASCADE;

-- Remove role column and constraint from hub_moderators
ALTER TABLE hub_moderators DROP CONSTRAINT IF EXISTS hub_moderator_role_check;
ALTER TABLE hub_moderators DROP COLUMN IF EXISTS role;
