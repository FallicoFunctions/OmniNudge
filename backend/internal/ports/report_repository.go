package ports

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
)

// ReportRepository defines the interface for report persistence operations.
type ReportRepository interface {
	Create(ctx context.Context, report *domain.Report) error
	GetByID(ctx context.Context, id int) (*domain.Report, error)
	CountByReporterSince(ctx context.Context, reporterID int, since time.Time) (int, error)
	CountDistinctReportersByTargetSince(ctx context.Context, targetType string, targetID int, since time.Time) (int, error)
	UpdateStatus(ctx context.Context, id int, status string) error
	ListByStatus(ctx context.Context, status string, limit, offset int) ([]*domain.Report, error)
	ListByStatusPriority(ctx context.Context, status string, limit, offset int) ([]*domain.Report, error)
	ListByStatusWithCursor(ctx context.Context, status string, limit int, cursor *domain.TimeCursor) ([]*domain.Report, error)
}
