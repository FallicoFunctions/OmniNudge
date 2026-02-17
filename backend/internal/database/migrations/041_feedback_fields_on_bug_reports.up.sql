-- Extend bug_reports to support broader user feedback use-cases.
ALTER TABLE bug_reports
ADD COLUMN IF NOT EXISTS feedback_category VARCHAR(50) NOT NULL DEFAULT 'bug';

ALTER TABLE bug_reports
ADD COLUMN IF NOT EXISTS rating SMALLINT;

ALTER TABLE bug_reports
ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(50) NOT NULL DEFAULT 'report';

ALTER TABLE bug_reports
ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE bug_reports
ADD CONSTRAINT bug_reports_feedback_category_chk
CHECK (feedback_category IN ('bug', 'feature_request', 'other', 'nps', 'survey'));

ALTER TABLE bug_reports
ADD CONSTRAINT bug_reports_feedback_type_chk
CHECK (feedback_type IN ('report', 'feedback', 'survey', 'nps'));

ALTER TABLE bug_reports
ADD CONSTRAINT bug_reports_rating_chk
CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

CREATE INDEX IF NOT EXISTS idx_bug_reports_feedback_category ON bug_reports(feedback_category);
CREATE INDEX IF NOT EXISTS idx_bug_reports_feedback_type ON bug_reports(feedback_type);
CREATE INDEX IF NOT EXISTS idx_bug_reports_rating ON bug_reports(rating);
