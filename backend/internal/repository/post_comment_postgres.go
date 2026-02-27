package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresPostCommentRepository is a thin adapter over models.PostCommentRepository.
type PostgresPostCommentRepository struct {
	inner *models.PostCommentRepository
}

var _ ports.PostCommentRepository = (*PostgresPostCommentRepository)(nil)

// NewPostgresPostCommentRepository constructs a PostgresPostCommentRepository.
func NewPostgresPostCommentRepository(pool *pgxpool.Pool) ports.PostCommentRepository {
	return &PostgresPostCommentRepository{inner: models.NewPostCommentRepository(pool)}
}

func (r *PostgresPostCommentRepository) Create(ctx context.Context, comment *domain.PostComment) error {
	return r.inner.Create(ctx, comment)
}

func (r *PostgresPostCommentRepository) GetByID(ctx context.Context, id int) (*domain.PostComment, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresPostCommentRepository) GetUserCommentedPostIDs(ctx context.Context, userID int, postIDs []int) ([]int, error) {
	return r.inner.GetUserCommentedPostIDs(ctx, userID, postIDs)
}

func (r *PostgresPostCommentRepository) GetUserVotedCommentIDs(ctx context.Context, userID int, commentIDs []int) ([]int, error) {
	return r.inner.GetUserVotedCommentIDs(ctx, userID, commentIDs)
}

func (r *PostgresPostCommentRepository) GetUserRepliedCommentIDs(ctx context.Context, userID int, commentIDs []int) ([]int, error) {
	return r.inner.GetUserRepliedCommentIDs(ctx, userID, commentIDs)
}

func (r *PostgresPostCommentRepository) GetByPostID(ctx context.Context, postID int, sortBy string, limit, offset int, userID *int) ([]*domain.PostComment, error) {
	return r.inner.GetByPostID(ctx, postID, sortBy, limit, offset, userID)
}

func (r *PostgresPostCommentRepository) GetReplies(ctx context.Context, parentCommentID int, sortBy string, limit, offset int, userID *int) ([]*domain.PostComment, error) {
	return r.inner.GetReplies(ctx, parentCommentID, sortBy, limit, offset, userID)
}

func (r *PostgresPostCommentRepository) GetByUserID(ctx context.Context, userID int, limit, offset int) ([]*domain.PostComment, error) {
	return r.inner.GetByUserID(ctx, userID, limit, offset)
}

func (r *PostgresPostCommentRepository) Update(ctx context.Context, comment *domain.PostComment) error {
	return r.inner.Update(ctx, comment)
}

func (r *PostgresPostCommentRepository) SetInboxRepliesDisabled(ctx context.Context, commentID, userID int, disabled bool) error {
	return r.inner.SetInboxRepliesDisabled(ctx, commentID, userID, disabled)
}

func (r *PostgresPostCommentRepository) SoftDelete(ctx context.Context, commentID int) error {
	return r.inner.SoftDelete(ctx, commentID)
}

func (r *PostgresPostCommentRepository) Vote(ctx context.Context, commentID int, userID int, isUpvote *bool) error {
	return r.inner.Vote(ctx, commentID, userID, isUpvote)
}

func (r *PostgresPostCommentRepository) GetReplyCount(ctx context.Context, commentID int) (int, error) {
	return r.inner.GetReplyCount(ctx, commentID)
}

func (r *PostgresPostCommentRepository) MarkAsRemoved(ctx context.Context, commentID int, moderatorID int) error {
	return r.inner.MarkAsRemoved(ctx, commentID, moderatorID)
}

func (r *PostgresPostCommentRepository) MarkAsApproved(ctx context.Context, commentID int) error {
	return r.inner.MarkAsApproved(ctx, commentID)
}
