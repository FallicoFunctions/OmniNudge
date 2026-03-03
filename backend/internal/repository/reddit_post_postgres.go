package repository

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRedditPostRepository struct {
	inner *models.RedditPostRepository
}

// NewPostgresRedditPostRepository returns a ports.RedditPostRepository backed by Postgres.
func NewPostgresRedditPostRepository(pool *pgxpool.Pool) ports.RedditPostRepository {
	return &PostgresRedditPostRepository{inner: models.NewRedditPostRepository(pool)}
}

var _ ports.RedditPostRepository = (*PostgresRedditPostRepository)(nil)

func (r *PostgresRedditPostRepository) UpsertPosts(ctx context.Context, posts []*domain.CachedRedditPost) error {
	return r.inner.UpsertPosts(ctx, posts)
}
