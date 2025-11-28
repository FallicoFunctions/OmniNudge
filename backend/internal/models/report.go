package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Report represents a moderation report
type Report struct {
	ID         int       `json:"id"`
	ReporterID int       `json:"reporter_id"`
	TargetType string    `json:"target_type"` // post, comment, user, message
	TargetID   int       `json:"target_id"`
	Reason     string    `json:"reason,omitempty"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
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
		INSERT INTO reports (reporter_id, target_type, target_id, reason)
		VALUES ($1, $2, $3, $4)
		RETURNING id, status, created_at
	`
	return r.pool.QueryRow(ctx, query, report.ReporterID, report.TargetType, report.TargetID, report.Reason).
		Scan(&report.ID, &report.Status, &report.CreatedAt)
}

// UpdateStatus updates report status
func (r *ReportRepository) UpdateStatus(ctx context.Context, id int, status string) error {
	_, err := r.pool.Exec(ctx, `UPDATE reports SET status = $2 WHERE id = $1`, id, status)
	return err
}

// ListByStatus lists reports by status
func (r *ReportRepository) ListByStatus(ctx context.Context, status string, limit, offset int) ([]*Report, error) {
	query := `
		SELECT id, reporter_id, target_type, target_id, reason, status, created_at
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
		if err := rows.Scan(&rep.ID, &rep.ReporterID, &rep.TargetType, &rep.TargetID, &rep.Reason, &rep.Status, &rep.CreatedAt); err != nil {
			return nil, err
		}
		reports = append(reports, rep)
	}
	return reports, rows.Err()
}
