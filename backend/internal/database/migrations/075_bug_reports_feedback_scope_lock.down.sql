ALTER TABLE bug_reports
DROP CONSTRAINT IF EXISTS bug_reports_feedback_type_chk;

ALTER TABLE bug_reports
ADD CONSTRAINT bug_reports_feedback_type_chk
CHECK (feedback_type IN ('report', 'feedback', 'survey', 'nps'));

ALTER TABLE bug_reports
DROP CONSTRAINT IF EXISTS bug_reports_feedback_category_chk;

ALTER TABLE bug_reports
ADD CONSTRAINT bug_reports_feedback_category_chk
CHECK (feedback_category IN ('bug', 'feature_request', 'other', 'nps', 'survey'));
