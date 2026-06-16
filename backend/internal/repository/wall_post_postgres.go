package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresWallPostRepository adapts models.WallPostRepository to ports.WallPostRepository.
type PostgresWallPostRepository struct {
	inner *models.WallPostRepository
}

var _ ports.WallPostRepository = (*PostgresWallPostRepository)(nil)

func NewPostgresWallPostRepository(pool *pgxpool.Pool) ports.WallPostRepository {
	return &PostgresWallPostRepository{inner: models.NewWallPostRepository(pool)}
}

func (r *PostgresWallPostRepository) Create(ctx context.Context, post *models.WallPost) error {
	return r.inner.Create(ctx, post)
}

func (r *PostgresWallPostRepository) GetByProfileUserID(ctx context.Context, profileUserID, viewerID, limit, offset int) ([]*models.WallPost, error) {
	return r.inner.GetByProfileUserID(ctx, profileUserID, viewerID, limit, offset)
}

func (r *PostgresWallPostRepository) GetPendingByProfileUserID(ctx context.Context, profileUserID, limit, offset int) ([]*models.WallPost, error) {
	return r.inner.GetPendingByProfileUserID(ctx, profileUserID, limit, offset)
}

func (r *PostgresWallPostRepository) ApprovePost(ctx context.Context, id int) error {
	return r.inner.ApprovePost(ctx, id)
}

func (r *PostgresWallPostRepository) GetWallStats(ctx context.Context, profileUserID int) (models.WallStats, error) {
	return r.inner.GetWallStats(ctx, profileUserID)
}

func (r *PostgresWallPostRepository) GetByID(ctx context.Context, id int) (*models.WallPost, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresWallPostRepository) SoftDelete(ctx context.Context, id int) error {
	return r.inner.SoftDelete(ctx, id)
}

func (r *PostgresWallPostRepository) SetPostReaction(ctx context.Context, wallPostID, userID int, reaction models.ReactionType) (bool, bool, int, int, error) {
	return r.inner.SetPostReaction(ctx, wallPostID, userID, reaction)
}

func (r *PostgresWallPostRepository) CreateComment(ctx context.Context, comment *models.WallPostComment) error {
	return r.inner.CreateComment(ctx, comment)
}

func (r *PostgresWallPostRepository) GetComments(ctx context.Context, wallPostID, viewerID, limit, offset int) ([]*models.WallPostComment, error) {
	return r.inner.GetComments(ctx, wallPostID, viewerID, limit, offset)
}

func (r *PostgresWallPostRepository) GetCommentByID(ctx context.Context, id int) (*models.WallPostComment, error) {
	return r.inner.GetCommentByID(ctx, id)
}

func (r *PostgresWallPostRepository) DeleteComment(ctx context.Context, id int) error {
	return r.inner.DeleteComment(ctx, id)
}

func (r *PostgresWallPostRepository) SetCommentReaction(ctx context.Context, commentID, userID int, reaction models.ReactionType) (bool, bool, int, int, error) {
	return r.inner.SetCommentReaction(ctx, commentID, userID, reaction)
}
