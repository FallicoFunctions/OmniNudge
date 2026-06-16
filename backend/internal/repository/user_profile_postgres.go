package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresUserProfileRepository adapts models.UserProfileRepository to ports.UserProfileRepository.
type PostgresUserProfileRepository struct {
	inner *models.UserProfileRepository
}

var _ ports.UserProfileRepository = (*PostgresUserProfileRepository)(nil)

func NewPostgresUserProfileRepository(pool *pgxpool.Pool) ports.UserProfileRepository {
	return &PostgresUserProfileRepository{inner: models.NewUserProfileRepository(pool)}
}

func (r *PostgresUserProfileRepository) GetByUserID(ctx context.Context, userID int) (*domain.UserProfile, error) {
	return r.inner.GetByUserID(ctx, userID)
}

func (r *PostgresUserProfileRepository) Upsert(ctx context.Context, userID int, bio, avatarURL, statusText, bannerURL, topFriendsJSON, location *string) error {
	return r.inner.Upsert(ctx, userID, bio, avatarURL, statusText, bannerURL, topFriendsJSON, location)
}

func (r *PostgresUserProfileRepository) UpdateBannerURL(ctx context.Context, userID int, bannerURL *string) error {
	return r.inner.UpdateBannerURL(ctx, userID, bannerURL)
}

func (r *PostgresUserProfileRepository) UpdateTopFriends(ctx context.Context, userID int, topFriendsJSON *string) error {
	return r.inner.UpdateTopFriends(ctx, userID, topFriendsJSON)
}
