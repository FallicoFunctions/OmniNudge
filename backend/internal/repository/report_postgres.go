package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresReportRepository is a thin adapter over models.ReportRepository.
type PostgresReportRepository struct {
	inner *models.ReportRepository
}

var _ ports.ReportRepository = (*PostgresReportRepository)(nil)

// NewPostgresReportRepository constructs a PostgresReportRepository.
func NewPostgresReportRepository(pool *pgxpool.Pool) ports.ReportRepository {
	return &PostgresReportRepository{inner: models.NewReportRepository(pool)}
}

func (r *PostgresReportRepository) Create(ctx context.Context, report *domain.Report) error {
	return r.inner.Create(ctx, report)
}

func (r *PostgresReportRepository) GetByID(ctx context.Context, id int) (*domain.Report, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresReportRepository) CountByReporterSince(ctx context.Context, reporterID int, since time.Time) (int, error) {
	return r.inner.CountByReporterSince(ctx, reporterID, since)
}

func (r *PostgresReportRepository) CountDistinctReportersByTargetSince(ctx context.Context, targetType string, targetID int, since time.Time) (int, error) {
	return r.inner.CountDistinctReportersByTargetSince(ctx, targetType, targetID, since)
}

func (r *PostgresReportRepository) UpdateStatus(ctx context.Context, id int, status string) error {
	return r.inner.UpdateStatus(ctx, id, status)
}

func (r *PostgresReportRepository) ListByStatus(ctx context.Context, status string, limit, offset int) ([]*domain.Report, error) {
	return r.inner.ListByStatus(ctx, status, limit, offset)
}

func (r *PostgresReportRepository) ListByStatusPriority(ctx context.Context, status string, limit, offset int) ([]*domain.Report, error) {
	return r.inner.ListByStatusPriority(ctx, status, limit, offset)
}

func (r *PostgresReportRepository) ListByStatusWithCursor(ctx context.Context, status string, limit int, cursor *domain.TimeCursor) ([]*domain.Report, error) {
	return r.inner.ListByStatusWithCursor(ctx, status, limit, cursor)
}
