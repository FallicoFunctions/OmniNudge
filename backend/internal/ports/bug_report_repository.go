package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// BugReportRepository defines the interface for bug report persistence operations.
type BugReportRepository interface {
	Create(ctx context.Context, report *domain.BugReport) error
	GetAll(ctx context.Context, status *string, category *string, feedbackType *string, limit, offset int) ([]*domain.BugReport, error)
	GetAllWithCursor(ctx context.Context, status *string, category *string, feedbackType *string, limit int, cursor *domain.TimeCursor) ([]*domain.BugReport, error)
	GetByID(ctx context.Context, id int) (*domain.BugReport, error)
	Update(ctx context.Context, id int, status string, adminNotes *string) error
}
