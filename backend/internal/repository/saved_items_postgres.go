package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
)

// PostgresSavedItemsRepository is a thin adapter over models.SavedItemsRepository.
type PostgresSavedItemsRepository struct {
	inner *models.SavedItemsRepository
}

var _ ports.SavedItemsRepository = (*PostgresSavedItemsRepository)(nil)

// NewPostgresSavedItemsRepository constructs a PostgresSavedItemsRepository.
func NewPostgresSavedItemsRepository(pool *pgxpool.Pool) ports.SavedItemsRepository {
	return &PostgresSavedItemsRepository{inner: models.NewSavedItemsRepository(pool)}
}

func (r *PostgresSavedItemsRepository) SavePost(ctx context.Context, userID, postID int) error {
	return r.inner.SavePost(ctx, userID, postID)
}

func (r *PostgresSavedItemsRepository) RemovePost(ctx context.Context, userID, postID int) error {
	return r.inner.RemovePost(ctx, userID, postID)
}

func (r *PostgresSavedItemsRepository) SaveRedditComment(ctx context.Context, userID, commentID int) error {
	return r.inner.SaveRedditComment(ctx, userID, commentID)
}

func (r *PostgresSavedItemsRepository) RemoveRedditComment(ctx context.Context, userID, commentID int) error {
	return r.inner.RemoveRedditComment(ctx, userID, commentID)
}

func (r *PostgresSavedItemsRepository) SavePostComment(ctx context.Context, userID, commentID int) error {
	return r.inner.SavePostComment(ctx, userID, commentID)
}

func (r *PostgresSavedItemsRepository) RemovePostComment(ctx context.Context, userID, commentID int) error {
	return r.inner.RemovePostComment(ctx, userID, commentID)
}

func (r *PostgresSavedItemsRepository) IsPostSaved(ctx context.Context, userID, postID int) (bool, error) {
	return r.inner.IsPostSaved(ctx, userID, postID)
}

func (r *PostgresSavedItemsRepository) IsRedditCommentSaved(ctx context.Context, userID, commentID int) (bool, error) {
	return r.inner.IsRedditCommentSaved(ctx, userID, commentID)
}

func (r *PostgresSavedItemsRepository) GetSavedPosts(ctx context.Context, userID int) ([]*domain.SavedPostOverview, error) {
	return r.inner.GetSavedPosts(ctx, userID)
}

func (r *PostgresSavedItemsRepository) GetSavedRedditComments(ctx context.Context, userID int) ([]*domain.RedditPostComment, error) {
	return r.inner.GetSavedRedditComments(ctx, userID)
}

func (r *PostgresSavedItemsRepository) GetSavedPostComments(ctx context.Context, userID int) ([]*domain.SavedPostComment, error) {
	return r.inner.GetSavedPostComments(ctx, userID)
}

func (r *PostgresSavedItemsRepository) SaveRedditPost(ctx context.Context, userID int, post *domain.RedditPostDetails) error {
	return r.inner.SaveRedditPost(ctx, userID, post)
}

func (r *PostgresSavedItemsRepository) RemoveRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error {
	return r.inner.RemoveRedditPost(ctx, userID, subreddit, redditPostID)
}

func (r *PostgresSavedItemsRepository) IsRedditPostSaved(ctx context.Context, userID int, subreddit, redditPostID string) (bool, error) {
	return r.inner.IsRedditPostSaved(ctx, userID, subreddit, redditPostID)
}

func (r *PostgresSavedItemsRepository) SaveRedditAPIComment(ctx context.Context, userID int, comment *domain.RedditAPICommentDetails) error {
	return r.inner.SaveRedditAPIComment(ctx, userID, comment)
}

func (r *PostgresSavedItemsRepository) RemoveRedditAPIComment(ctx context.Context, userID int, redditCommentID string) error {
	return r.inner.RemoveRedditAPIComment(ctx, userID, redditCommentID)
}

func (r *PostgresSavedItemsRepository) IsRedditAPICommentSaved(ctx context.Context, userID int, redditCommentID string) (bool, error) {
	return r.inner.IsRedditAPICommentSaved(ctx, userID, redditCommentID)
}

func (r *PostgresSavedItemsRepository) GetSavedRedditAPIComments(ctx context.Context, userID int) ([]*domain.SavedRedditAPIComment, error) {
	return r.inner.GetSavedRedditAPIComments(ctx, userID)
}

func (r *PostgresSavedItemsRepository) GetSavedRedditPosts(ctx context.Context, userID int) ([]*domain.SavedRedditPost, error) {
	return r.inner.GetSavedRedditPosts(ctx, userID)
}

func (r *PostgresSavedItemsRepository) HidePost(ctx context.Context, userID, postID int) error {
	return r.inner.HidePost(ctx, userID, postID)
}

func (r *PostgresSavedItemsRepository) UnhidePost(ctx context.Context, userID, postID int) error {
	return r.inner.UnhidePost(ctx, userID, postID)
}

func (r *PostgresSavedItemsRepository) IsPostHidden(ctx context.Context, userID, postID int) (bool, error) {
	return r.inner.IsPostHidden(ctx, userID, postID)
}

func (r *PostgresSavedItemsRepository) GetHiddenPosts(ctx context.Context, userID int) ([]*domain.SavedPostOverview, error) {
	return r.inner.GetHiddenPosts(ctx, userID)
}

func (r *PostgresSavedItemsRepository) HideRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error {
	return r.inner.HideRedditPost(ctx, userID, subreddit, redditPostID)
}

func (r *PostgresSavedItemsRepository) UnhideRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error {
	return r.inner.UnhideRedditPost(ctx, userID, subreddit, redditPostID)
}

func (r *PostgresSavedItemsRepository) IsRedditPostHidden(ctx context.Context, userID int, subreddit, redditPostID string) (bool, error) {
	return r.inner.IsRedditPostHidden(ctx, userID, subreddit, redditPostID)
}

func (r *PostgresSavedItemsRepository) GetHiddenRedditPosts(ctx context.Context, userID int) ([]*domain.SavedRedditPost, error) {
	return r.inner.GetHiddenRedditPosts(ctx, userID)
}
