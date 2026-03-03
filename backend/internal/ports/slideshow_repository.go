package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// SlideshowRepository defines persistence operations for slideshow sessions.
type SlideshowRepository interface {
	CreateSession(ctx context.Context, session *domain.SlideshowSession) error
	GetByConversationID(ctx context.Context, conversationID int) (*domain.SlideshowSession, error)
	GetByID(ctx context.Context, id int) (*domain.SlideshowSession, error)
	UpdateCurrentIndex(ctx context.Context, sessionID int, index int) error
	UpdateController(ctx context.Context, sessionID int, newControllerID int) error
	UpdateAutoAdvance(ctx context.Context, sessionID int, autoAdvance bool, interval int) error
	Delete(ctx context.Context, sessionID int) error
	AddMediaItem(ctx context.Context, item *domain.SlideshowMediaItem) error
	AddMediaItems(ctx context.Context, sessionID int, mediaFileIDs []int) error
	GetMediaItems(ctx context.Context, sessionID int) ([]domain.SlideshowMediaItem, error)
}
