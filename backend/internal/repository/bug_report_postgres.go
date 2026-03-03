package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresBugReportRepository is a thin adapter over models.BugReportRepository.
type PostgresBugReportRepository struct {
	inner *models.BugReportRepository
}

var _ ports.BugReportRepository = (*PostgresBugReportRepository)(nil)

// NewPostgresBugReportRepository constructs a PostgresBugReportRepository.
func NewPostgresBugReportRepository(pool *pgxpool.Pool) ports.BugReportRepository {
	return &PostgresBugReportRepository{inner: models.NewBugReportRepository(pool)}
}

func (r *PostgresBugReportRepository) Create(ctx context.Context, report *domain.BugReport) error {
	return r.inner.Create(ctx, report)
}

func (r *PostgresBugReportRepository) GetAll(ctx context.Context, status *string, category *string, feedbackType *string, limit, offset int) ([]*domain.BugReport, error) {
	return r.inner.GetAll(ctx, status, category, feedbackType, limit, offset)
}

func (r *PostgresBugReportRepository) GetAllWithCursor(ctx context.Context, status *string, category *string, feedbackType *string, limit int, cursor *domain.TimeCursor) ([]*domain.BugReport, error) {
	return r.inner.GetAllWithCursor(ctx, status, category, feedbackType, limit, cursor)
}

func (r *PostgresBugReportRepository) GetByID(ctx context.Context, id int) (*domain.BugReport, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresBugReportRepository) Update(ctx context.Context, id int, status string, adminNotes *string) error {
	return r.inner.Update(ctx, id, status, adminNotes)
}
