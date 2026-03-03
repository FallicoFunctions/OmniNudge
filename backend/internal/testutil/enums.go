package testutil

// Valid enum values for database constraint-checked columns.
// Use these in repository tests to avoid constraint violations.
const (
	// bug_reports.feedback_type — must be 'report'
	FeedbackTypeReport = "report"

	// bug_reports.feedback_category — must be one of: bug, feature_request, other
	FeedbackCategoryBug            = "bug"
	FeedbackCategoryFeatureRequest = "feature_request"
	FeedbackCategoryOther          = "other"

	// bug_reports.status — must be one of: new, investigating, fixed, wont_fix, duplicate
	BugReportStatusNew           = "new"
	BugReportStatusInvestigating = "investigating"
	BugReportStatusFixed         = "fixed"
	BugReportStatusWontFix       = "wont_fix"
	BugReportStatusDuplicate     = "duplicate"

	// known_bugs.status — must be one of: investigating, in_progress, fixed, wont_fix
	KnownBugStatusInvestigating = "investigating"
	KnownBugStatusInProgress    = "in_progress"
	KnownBugStatusFixed         = "fixed"
	KnownBugStatusWontFix       = "wont_fix"

	// known_bugs.severity — must be one of: low, medium, high, critical
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"

	// user_themes.theme_type — predefined/variable_customization require css_variables NOT NULL; full_css requires custom_css NOT NULL
	ThemeTypeVariableCustomization = "variable_customization"
	ThemeTypeFullCSS               = "full_css"
	ThemeTypePredefined            = "predefined"

	// user_themes.scope_type
	ThemeScopeGlobal  = "global"
	ThemeScopePerPage = "per_page"

	// reports.status — DB default is 'open'
	ReportStatusOpen     = "open"
	ReportStatusResolved = "resolved"
)
