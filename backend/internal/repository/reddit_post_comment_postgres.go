package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresRedditPostCommentRepository is a thin adapter over models.RedditPostCommentRepository.
type PostgresRedditPostCommentRepository struct {
	inner *models.RedditPostCommentRepository
}

var _ ports.RedditPostCommentRepository = (*PostgresRedditPostCommentRepository)(nil)

// NewPostgresRedditPostCommentRepository constructs a PostgresRedditPostCommentRepository.
func NewPostgresRedditPostCommentRepository(pool *pgxpool.Pool) ports.RedditPostCommentRepository {
	return &PostgresRedditPostCommentRepository{inner: models.NewRedditPostCommentRepository(pool)}
}

func (r *PostgresRedditPostCommentRepository) Create(ctx context.Context, comment *domain.RedditPostComment) error {
	return r.inner.Create(ctx, comment)
}

func (r *PostgresRedditPostCommentRepository) GetByRedditPostWithUserVotes(ctx context.Context, subreddit, postID string, userID int) ([]*domain.RedditPostComment, error) {
	return r.inner.GetByRedditPostWithUserVotes(ctx, subreddit, postID, userID)
}

func (r *PostgresRedditPostCommentRepository) GetByRedditPost(ctx context.Context, subreddit, postID string) ([]*domain.RedditPostComment, error) {
	return r.inner.GetByRedditPost(ctx, subreddit, postID)
}

func (r *PostgresRedditPostCommentRepository) GetByID(ctx context.Context, id int) (*domain.RedditPostComment, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresRedditPostCommentRepository) Update(ctx context.Context, id int, content string) error {
	return r.inner.Update(ctx, id, content)
}

func (r *PostgresRedditPostCommentRepository) SetInboxRepliesDisabled(ctx context.Context, id int, userID int, disabled bool) error {
	return r.inner.SetInboxRepliesDisabled(ctx, id, userID, disabled)
}

func (r *PostgresRedditPostCommentRepository) Delete(ctx context.Context, id int) error {
	return r.inner.Delete(ctx, id)
}

func (r *PostgresRedditPostCommentRepository) GetUserVote(ctx context.Context, commentID, userID int) (int, error) {
	return r.inner.GetUserVote(ctx, commentID, userID)
}

func (r *PostgresRedditPostCommentRepository) SetVote(ctx context.Context, commentID, userID, voteType int) error {
	return r.inner.SetVote(ctx, commentID, userID, voteType)
}
