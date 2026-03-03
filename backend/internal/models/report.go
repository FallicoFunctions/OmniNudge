package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Report represents a moderation report
type Report struct {
	ID          int        `json:"id"`
	ReporterID  int        `json:"reporter_id"`
	TargetType  string     `json:"target_type"` // post, comment, user, message
	TargetID    int        `json:"target_id"`
	Reason      string     `json:"reason,omitempty"`
	Description *string    `json:"description,omitempty"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	ResolvedAt  *time.Time `json:"resolved_at,omitempty"`
}

// ReportRepository handles report persistence
type ReportRepository struct {
	pool *pgxpool.Pool
}

// NewReportRepository creates a new repo
func NewReportRepository(pool *pgxpool.Pool) *ReportRepository {
	return &ReportRepository{pool: pool}
}

// Create inserts a report
func (r *ReportRepository) Create(ctx context.Context, report *Report) error {
	query := `
		INSERT INTO reports (reporter_id, target_type, target_id, reason, description)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, status, created_at
	`
	return r.pool.QueryRow(ctx, query, report.ReporterID, report.TargetType, report.TargetID, report.Reason, report.Description).
		Scan(&report.ID, &report.Status, &report.CreatedAt)
}

// GetByID fetches a report by its ID.
func (r *ReportRepository) GetByID(ctx context.Context, id int) (*Report, error) {
	query := `
		SELECT id, reporter_id, target_type, target_id, reason, description, status, created_at, resolved_at
		FROM reports
		WHERE id = $1
	`
	rep := &Report{}
	if err := r.pool.QueryRow(ctx, query, id).Scan(
		&rep.ID,
		&rep.ReporterID,
		&rep.TargetType,
		&rep.TargetID,
		&rep.Reason,
		&rep.Description,
		&rep.Status,
		&rep.CreatedAt,
		&rep.ResolvedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return rep, nil
}

// CountByReporterSince returns how many reports a user has filed since a timestamp.
func (r *ReportRepository) CountByReporterSince(ctx context.Context, reporterID int, since time.Time) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM reports
		WHERE reporter_id = $1
		  AND created_at >= $2
	`, reporterID, since).Scan(&count)
	return count, err
}

// CountDistinctReportersByTargetSince returns how many unique users reported
// a specific target since the given timestamp.
func (r *ReportRepository) CountDistinctReportersByTargetSince(
	ctx context.Context,
	targetType string,
	targetID int,
	since time.Time,
) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(DISTINCT reporter_id)
		FROM reports
		WHERE target_type = $1
		  AND target_id = $2
		  AND created_at >= $3
	`, targetType, targetID, since).Scan(&count)
	return count, err
}

// UpdateStatus updates report status
func (r *ReportRepository) UpdateStatus(ctx context.Context, id int, status string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE reports
		SET status = $2::varchar,
		    resolved_at = CASE
		        WHEN $2::varchar = 'open' THEN NULL
		        WHEN status = 'open' AND $2::varchar <> 'open' THEN NOW()
		        ELSE resolved_at
		    END
		WHERE id = $1
	`, id, status)
	return err
}

// ListByStatus lists reports by status
func (r *ReportRepository) ListByStatus(ctx context.Context, status string, limit, offset int) ([]*Report, error) {
	query := `
		SELECT id, reporter_id, target_type, target_id, reason, description, status, created_at, resolved_at
		FROM reports
		WHERE status = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.pool.Query(ctx, query, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []*Report
	for rows.Next() {
		rep := &Report{}
		if err := rows.Scan(&rep.ID, &rep.ReporterID, &rep.TargetType, &rep.TargetID, &rep.Reason, &rep.Description, &rep.Status, &rep.CreatedAt, &rep.ResolvedAt); err != nil {
			return nil, err
		}
		reports = append(reports, rep)
	}
	return reports, rows.Err()
}

// ListByStatusPriority lists reports by moderation urgency, then recency.
// Priority order: csam > illegal_content > harassment > spam > everything else.
func (r *ReportRepository) ListByStatusPriority(ctx context.Context, status string, limit, offset int) ([]*Report, error) {
	query := `
		SELECT id, reporter_id, target_type, target_id, reason, description, status, created_at, resolved_at
		FROM reports
		WHERE status = $1
		ORDER BY
			CASE reason
				WHEN 'csam' THEN 0
				WHEN 'illegal_content' THEN 1
				WHEN 'harassment' THEN 2
				WHEN 'spam' THEN 3
				ELSE 4
			END ASC,
			created_at DESC,
			id DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.pool.Query(ctx, query, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []*Report
	for rows.Next() {
		rep := &Report{}
		if err := rows.Scan(&rep.ID, &rep.ReporterID, &rep.TargetType, &rep.TargetID, &rep.Reason, &rep.Description, &rep.Status, &rep.CreatedAt, &rep.ResolvedAt); err != nil {
			return nil, err
		}
		reports = append(reports, rep)
	}
	return reports, rows.Err()
}

// ListByStatusWithCursor lists reports by status using cursor-based pagination.
func (r *ReportRepository) ListByStatusWithCursor(
	ctx context.Context,
	status string,
	limit int,
	cursor *TimeCursor,
) ([]*Report, error) {
	query := `
		SELECT id, reporter_id, target_type, target_id, reason, description, status, created_at, resolved_at
		FROM reports
		WHERE status = $1
	`
	args := []interface{}{status}
	paramIdx := 2
	if cursor != nil {
		query += fmt.Sprintf(" AND (created_at, id) < ($%d, $%d)", paramIdx, paramIdx+1)
		args = append(args, cursor.Timestamp, cursor.ID)
		paramIdx += 2
	}
	query += fmt.Sprintf(" ORDER BY created_at DESC, id DESC LIMIT $%d", paramIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []*Report
	for rows.Next() {
		rep := &Report{}
		if err := rows.Scan(&rep.ID, &rep.ReporterID, &rep.TargetType, &rep.TargetID, &rep.Reason, &rep.Description, &rep.Status, &rep.CreatedAt, &rep.ResolvedAt); err != nil {
			return nil, err
		}
		reports = append(reports, rep)
	}
	return reports, rows.Err()
}
