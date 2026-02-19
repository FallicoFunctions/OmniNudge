-- Normalize legacy feedback/survey/NPS entries into bug-report-only semantics.
UPDATE bug_reports
SET feedback_type = 'report'
WHERE feedback_type IS NULL OR feedback_type <> 'report';

UPDATE bug_reports
SET feedback_category = 'other'
WHERE feedback_category IS NULL
   OR feedback_category NOT IN ('bug', 'feature_request', 'other');

ALTER TABLE bug_reports
DROP CONSTRAINT IF EXISTS bug_reports_feedback_type_chk;

ALTER TABLE bug_reports
ADD CONSTRAINT bug_reports_feedback_type_chk
CHECK (feedback_type = 'report');

ALTER TABLE bug_reports
DROP CONSTRAINT IF EXISTS bug_reports_feedback_category_chk;

ALTER TABLE bug_reports
ADD CONSTRAINT bug_reports_feedback_category_chk
CHECK (feedback_category IN ('bug', 'feature_request', 'other'));
