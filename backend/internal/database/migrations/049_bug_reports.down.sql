DROP INDEX IF EXISTS idx_known_bugs_created_at;
DROP INDEX IF EXISTS idx_known_bugs_severity;
DROP INDEX IF EXISTS idx_known_bugs_status;
DROP INDEX IF EXISTS idx_bug_reports_created_at;
DROP INDEX IF EXISTS idx_bug_reports_status;
DROP INDEX IF EXISTS idx_bug_reports_user_id;

DROP TABLE IF EXISTS known_bugs;
DROP TABLE IF EXISTS bug_reports;
