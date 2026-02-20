ALTER TABLE messages DROP COLUMN IF EXISTS deleted_by_admin;
ALTER TABLE conversations DROP COLUMN IF EXISTS slow_mode_seconds;
DROP TABLE IF EXISTS group_audit_log;
DROP TABLE IF EXISTS group_member_restrictions;
