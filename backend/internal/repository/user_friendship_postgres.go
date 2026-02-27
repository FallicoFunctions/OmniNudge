package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresUserFriendshipRepository adapts models.UserFriendshipRepository to ports.UserFriendshipRepository.
type PostgresUserFriendshipRepository struct {
	inner *models.UserFriendshipRepository
}

var _ ports.UserFriendshipRepository = (*PostgresUserFriendshipRepository)(nil)

func NewPostgresUserFriendshipRepository(pool *pgxpool.Pool) ports.UserFriendshipRepository {
	return &PostgresUserFriendshipRepository{inner: models.NewUserFriendshipRepository(pool)}
}

func (r *PostgresUserFriendshipRepository) AreUsersFriends(ctx context.Context, userID, otherUserID int) (bool, error) {
	return r.inner.AreUsersFriends(ctx, userID, otherUserID)
}

func (r *PostgresUserFriendshipRepository) UpsertAccepted(ctx context.Context, userID, otherUserID int) error {
	return r.inner.UpsertAccepted(ctx, userID, otherUserID)
}
