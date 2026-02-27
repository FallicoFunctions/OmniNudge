package repository

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresSlideshowRepository struct {
	inner *models.SlideshowRepository
}

// NewPostgresSlideshowRepository returns a ports.SlideshowRepository backed by Postgres.
func NewPostgresSlideshowRepository(pool *pgxpool.Pool) ports.SlideshowRepository {
	return &PostgresSlideshowRepository{inner: models.NewSlideshowRepository(pool)}
}

var _ ports.SlideshowRepository = (*PostgresSlideshowRepository)(nil)

func (r *PostgresSlideshowRepository) CreateSession(ctx context.Context, session *domain.SlideshowSession) error {
	return r.inner.CreateSession(ctx, session)
}

func (r *PostgresSlideshowRepository) GetByConversationID(ctx context.Context, conversationID int) (*domain.SlideshowSession, error) {
	return r.inner.GetByConversationID(ctx, conversationID)
}

func (r *PostgresSlideshowRepository) GetByID(ctx context.Context, id int) (*domain.SlideshowSession, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresSlideshowRepository) UpdateCurrentIndex(ctx context.Context, sessionID int, index int) error {
	return r.inner.UpdateCurrentIndex(ctx, sessionID, index)
}

func (r *PostgresSlideshowRepository) UpdateController(ctx context.Context, sessionID int, newControllerID int) error {
	return r.inner.UpdateController(ctx, sessionID, newControllerID)
}

func (r *PostgresSlideshowRepository) UpdateAutoAdvance(ctx context.Context, sessionID int, autoAdvance bool, interval int) error {
	return r.inner.UpdateAutoAdvance(ctx, sessionID, autoAdvance, interval)
}

func (r *PostgresSlideshowRepository) Delete(ctx context.Context, sessionID int) error {
	return r.inner.Delete(ctx, sessionID)
}

func (r *PostgresSlideshowRepository) AddMediaItem(ctx context.Context, item *domain.SlideshowMediaItem) error {
	return r.inner.AddMediaItem(ctx, item)
}

func (r *PostgresSlideshowRepository) AddMediaItems(ctx context.Context, sessionID int, mediaFileIDs []int) error {
	return r.inner.AddMediaItems(ctx, sessionID, mediaFileIDs)
}

func (r *PostgresSlideshowRepository) GetMediaItems(ctx context.Context, sessionID int) ([]domain.SlideshowMediaItem, error) {
	return r.inner.GetMediaItems(ctx, sessionID)
}
