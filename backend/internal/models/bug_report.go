package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// BugReport represents a user-submitted bug report
type BugReport struct {
	ID            int        `json:"id"`
	UserID        *int       `json:"user_id"`
	PageURL       string     `json:"page_url"`
	Description   string     `json:"description"`
	ScreenshotURL *string    `json:"screenshot_url"`
	Status        string     `json:"status"`
	AdminNotes    *string    `json:"admin_notes,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	Username      *string    `json:"username,omitempty"` // Joined from users table
}

// KnownBug represents a known bug in the system
type KnownBug struct {
	ID               int        `json:"id"`
	Title            string     `json:"title"`
	Description      string     `json:"description"`
	Status           string     `json:"status"`
	Severity         string     `json:"severity"`
	AffectedPages    []string   `json:"affected_pages"`
	FixedInVersion   *string    `json:"fixed_in_version"`
	Workaround       *string    `json:"workaround"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	FixedAt          *time.Time `json:"fixed_at"`
}

// BugReportRepository handles database operations for bug reports
type BugReportRepository struct {
	pool *pgxpool.Pool
}

// NewBugReportRepository creates a new bug report repository
func NewBugReportRepository(pool *pgxpool.Pool) *BugReportRepository {
	return &BugReportRepository{pool: pool}
}

// Create inserts a new bug report
func (r *BugReportRepository) Create(ctx context.Context, report *BugReport) error {
	query := `
		INSERT INTO bug_reports (user_id, page_url, description, screenshot_url, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(
		ctx,
		query,
		report.UserID,
		report.PageURL,
		report.Description,
		report.ScreenshotURL,
		report.Status,
	).Scan(&report.ID, &report.CreatedAt, &report.UpdatedAt)
}

// GetAll retrieves all bug reports with optional status filter
func (r *BugReportRepository) GetAll(ctx context.Context, status *string, limit, offset int) ([]*BugReport, error) {
	var query string
	var args []interface{}

	if status != nil && *status != "" {
		query = `
			SELECT br.id, br.user_id, br.page_url, br.description, br.screenshot_url,
			       br.status, br.admin_notes, br.created_at, br.updated_at, u.username
			FROM bug_reports br
			LEFT JOIN users u ON br.user_id = u.id
			WHERE br.status = $1
			ORDER BY br.created_at DESC
			LIMIT $2 OFFSET $3
		`
		args = []interface{}{*status, limit, offset}
	} else {
		query = `
			SELECT br.id, br.user_id, br.page_url, br.description, br.screenshot_url,
			       br.status, br.admin_notes, br.created_at, br.updated_at, u.username
			FROM bug_reports br
			LEFT JOIN users u ON br.user_id = u.id
			ORDER BY br.created_at DESC
			LIMIT $1 OFFSET $2
		`
		args = []interface{}{limit, offset}
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []*BugReport
	for rows.Next() {
		report := &BugReport{}
		err := rows.Scan(
			&report.ID,
			&report.UserID,
			&report.PageURL,
			&report.Description,
			&report.ScreenshotURL,
			&report.Status,
			&report.AdminNotes,
			&report.CreatedAt,
			&report.UpdatedAt,
			&report.Username,
		)
		if err != nil {
			return nil, err
		}
		reports = append(reports, report)
	}

	return reports, rows.Err()
}

// GetByID retrieves a single bug report by ID
func (r *BugReportRepository) GetByID(ctx context.Context, id int) (*BugReport, error) {
	query := `
		SELECT br.id, br.user_id, br.page_url, br.description, br.screenshot_url,
		       br.status, br.admin_notes, br.created_at, br.updated_at, u.username
		FROM bug_reports br
		LEFT JOIN users u ON br.user_id = u.id
		WHERE br.id = $1
	`
	report := &BugReport{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&report.ID,
		&report.UserID,
		&report.PageURL,
		&report.Description,
		&report.ScreenshotURL,
		&report.Status,
		&report.AdminNotes,
		&report.CreatedAt,
		&report.UpdatedAt,
		&report.Username,
	)
	if err != nil {
		return nil, err
	}
	return report, nil
}

// Update updates a bug report's status and admin notes
func (r *BugReportRepository) Update(ctx context.Context, id int, status string, adminNotes *string) error {
	query := `
		UPDATE bug_reports
		SET status = $1, admin_notes = $2, updated_at = NOW()
		WHERE id = $3
	`
	_, err := r.pool.Exec(ctx, query, status, adminNotes, id)
	return err
}

// KnownBugRepository handles database operations for known bugs
type KnownBugRepository struct {
	pool *pgxpool.Pool
}

// NewKnownBugRepository creates a new known bug repository
func NewKnownBugRepository(pool *pgxpool.Pool) *KnownBugRepository {
	return &KnownBugRepository{pool: pool}
}

// GetAll retrieves all known bugs, optionally filtered by status
func (r *KnownBugRepository) GetAll(ctx context.Context, status *string) ([]*KnownBug, error) {
	var query string
	var args []interface{}

	if status != nil && *status != "" {
		query = `
			SELECT id, title, description, status, severity, affected_pages,
			       fixed_in_version, workaround, created_at, updated_at, fixed_at
			FROM known_bugs
			WHERE status = $1
			ORDER BY severity DESC, created_at DESC
		`
		args = []interface{}{*status}
	} else {
		query = `
			SELECT id, title, description, status, severity, affected_pages,
			       fixed_in_version, workaround, created_at, updated_at, fixed_at
			FROM known_bugs
			ORDER BY severity DESC, created_at DESC
		`
		args = []interface{}{}
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bugs []*KnownBug
	for rows.Next() {
		bug := &KnownBug{}
		err := rows.Scan(
			&bug.ID,
			&bug.Title,
			&bug.Description,
			&bug.Status,
			&bug.Severity,
			&bug.AffectedPages,
			&bug.FixedInVersion,
			&bug.Workaround,
			&bug.CreatedAt,
			&bug.UpdatedAt,
			&bug.FixedAt,
		)
		if err != nil {
			return nil, err
		}
		bugs = append(bugs, bug)
	}

	return bugs, rows.Err()
}

// Create inserts a new known bug
func (r *KnownBugRepository) Create(ctx context.Context, bug *KnownBug) error {
	query := `
		INSERT INTO known_bugs (title, description, status, severity, affected_pages, workaround)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(
		ctx,
		query,
		bug.Title,
		bug.Description,
		bug.Status,
		bug.Severity,
		bug.AffectedPages,
		bug.Workaround,
	).Scan(&bug.ID, &bug.CreatedAt, &bug.UpdatedAt)
}

// Update updates a known bug
func (r *KnownBugRepository) Update(ctx context.Context, bug *KnownBug) error {
	query := `
		UPDATE known_bugs
		SET title = $1, description = $2, status = $3, severity = $4,
		    affected_pages = $5, fixed_in_version = $6, workaround = $7,
		    updated_at = NOW(), fixed_at = $8
		WHERE id = $9
	`
	_, err := r.pool.Exec(
		ctx,
		query,
		bug.Title,
		bug.Description,
		bug.Status,
		bug.Severity,
		bug.AffectedPages,
		bug.FixedInVersion,
		bug.Workaround,
		bug.FixedAt,
		bug.ID,
	)
	return err
}

// Delete removes a known bug
func (r *KnownBugRepository) Delete(ctx context.Context, id int) error {
	query := `DELETE FROM known_bugs WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	return err
}
