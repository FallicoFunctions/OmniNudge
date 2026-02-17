ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_rating_chk;
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_feedback_type_chk;
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_feedback_category_chk;

DROP INDEX IF EXISTS idx_bug_reports_rating;
DROP INDEX IF EXISTS idx_bug_reports_feedback_type;
DROP INDEX IF EXISTS idx_bug_reports_feedback_category;

ALTER TABLE bug_reports DROP COLUMN IF EXISTS context;
ALTER TABLE bug_reports DROP COLUMN IF EXISTS feedback_type;
ALTER TABLE bug_reports DROP COLUMN IF EXISTS rating;
ALTER TABLE bug_reports DROP COLUMN IF EXISTS feedback_category;
