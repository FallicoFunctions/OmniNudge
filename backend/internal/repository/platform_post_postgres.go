package repository

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresPlatformPostRepository struct {
	inner *models.PlatformPostRepository
}

// NewPostgresPlatformPostRepository returns a ports.PlatformPostRepository backed by Postgres.
func NewPostgresPlatformPostRepository(pool *pgxpool.Pool) ports.PlatformPostRepository {
	return &PostgresPlatformPostRepository{inner: models.NewPlatformPostRepository(pool)}
}

var _ ports.PlatformPostRepository = (*PostgresPlatformPostRepository)(nil)

func (r *PostgresPlatformPostRepository) Create(ctx context.Context, post *domain.PlatformPost) error {
	return r.inner.Create(ctx, post)
}

func (r *PostgresPlatformPostRepository) GetByID(ctx context.Context, id int) (*domain.PlatformPost, error) {
	return r.inner.GetByID(ctx, id)
}

func (r *PostgresPlatformPostRepository) GetByIDWithUser(ctx context.Context, id int, userID *int) (*domain.PlatformPost, error) {
	return r.inner.GetByIDWithUser(ctx, id, userID)
}

func (r *PostgresPlatformPostRepository) GetFeed(ctx context.Context, sortBy string, limit, offset int) ([]*domain.PlatformPost, error) {
	return r.inner.GetFeed(ctx, sortBy, limit, offset)
}

func (r *PostgresPlatformPostRepository) GetByAuthor(ctx context.Context, authorID int, limit, offset int) ([]*domain.PlatformPost, error) {
	return r.inner.GetByAuthor(ctx, authorID, limit, offset)
}

func (r *PostgresPlatformPostRepository) GetByHub(ctx context.Context, hubID int, sortBy string, limit, offset int) ([]*domain.PlatformPost, error) {
	return r.inner.GetByHub(ctx, hubID, sortBy, limit, offset)
}

func (r *PostgresPlatformPostRepository) GetByHubWithUser(ctx context.Context, hubID int, sortBy string, limit, offset int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetByHubWithUser(ctx, hubID, sortBy, limit, offset, userID, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetByHubWithUserExcludingPinned(ctx context.Context, hubID int, sortBy string, limit, offset int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetByHubWithUserExcludingPinned(ctx, hubID, sortBy, limit, offset, userID, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetPinnedByHubWithUser(ctx context.Context, hubID int, limit int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetPinnedByHubWithUser(ctx, hubID, limit, userID, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetByHubWithCursor(ctx context.Context, hubID int, sortBy string, limit int, cursor *domain.PlatformPostCursor, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetByHubWithCursor(ctx, hubID, sortBy, limit, cursor, userID, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetByHubWithCursorExcludingPinned(ctx context.Context, hubID int, sortBy string, limit int, cursor *domain.PlatformPostCursor, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetByHubWithCursorExcludingPinned(ctx, hubID, sortBy, limit, cursor, userID, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetBySubredditWithUser(ctx context.Context, subreddit string, sortBy string, limit, offset int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetBySubredditWithUser(ctx, subreddit, sortBy, limit, offset, userID, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetBySubredditWithCursor(ctx context.Context, subreddit string, sortBy string, limit int, cursor *domain.PlatformPostCursor, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetBySubredditWithCursor(ctx, subreddit, sortBy, limit, cursor, userID, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetByTags(ctx context.Context, tags []string, limit, offset int) ([]*domain.PlatformPost, error) {
	return r.inner.GetByTags(ctx, tags, limit, offset)
}

func (r *PostgresPlatformPostRepository) Update(ctx context.Context, post *domain.PlatformPost) error {
	return r.inner.Update(ctx, post)
}

func (r *PostgresPlatformPostRepository) SoftDelete(ctx context.Context, postID int) error {
	return r.inner.SoftDelete(ctx, postID)
}

func (r *PostgresPlatformPostRepository) IncrementViewCount(ctx context.Context, postID int) error {
	return r.inner.IncrementViewCount(ctx, postID)
}

func (r *PostgresPlatformPostRepository) GetUserVotedPostIDs(ctx context.Context, userID int, postIDs []int) ([]int, error) {
	return r.inner.GetUserVotedPostIDs(ctx, userID, postIDs)
}

func (r *PostgresPlatformPostRepository) UpdateCreatedAt(ctx context.Context, postID int, createdAt time.Time) error {
	return r.inner.UpdateCreatedAt(ctx, postID, createdAt)
}

func (r *PostgresPlatformPostRepository) Vote(ctx context.Context, postID int, userID int, isUpvote *bool) error {
	return r.inner.Vote(ctx, postID, userID, isUpvote)
}

func (r *PostgresPlatformPostRepository) GetPopularFeed(ctx context.Context, subscribedHubIDs []int, sort string, limit, offset int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetPopularFeed(ctx, subscribedHubIDs, sort, limit, offset, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetPopularFeedWithCursor(ctx context.Context, subscribedHubIDs []int, sort string, limit int, cursor *domain.PlatformPostCursor, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetPopularFeedWithCursor(ctx, subscribedHubIDs, sort, limit, cursor, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetAllFeed(ctx context.Context, sort string, limit, offset int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetAllFeed(ctx, sort, limit, offset, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) GetAllFeedWithCursor(ctx context.Context, sort string, limit int, cursor *domain.PlatformPostCursor, startTime, endTime *time.Time) ([]*domain.PlatformPost, error) {
	return r.inner.GetAllFeedWithCursor(ctx, sort, limit, cursor, startTime, endTime)
}

func (r *PostgresPlatformPostRepository) MarkAsRemoved(ctx context.Context, postID int, moderatorID int) error {
	return r.inner.MarkAsRemoved(ctx, postID, moderatorID)
}

func (r *PostgresPlatformPostRepository) MarkAsApproved(ctx context.Context, postID int) error {
	return r.inner.MarkAsApproved(ctx, postID)
}

func (r *PostgresPlatformPostRepository) LockPost(ctx context.Context, postID int) error {
	return r.inner.LockPost(ctx, postID)
}

func (r *PostgresPlatformPostRepository) UnlockPost(ctx context.Context, postID int) error {
	return r.inner.UnlockPost(ctx, postID)
}

func (r *PostgresPlatformPostRepository) PinPost(ctx context.Context, postID int) error {
	return r.inner.PinPost(ctx, postID)
}

func (r *PostgresPlatformPostRepository) UnpinPost(ctx context.Context, postID int) error {
	return r.inner.UnpinPost(ctx, postID)
}

func (r *PostgresPlatformPostRepository) GetPinnedIDsByHub(ctx context.Context, hubID int) ([]int, error) {
	return r.inner.GetPinnedIDsByHub(ctx, hubID)
}

func (r *PostgresPlatformPostRepository) UpdatePinnedOrder(ctx context.Context, hubID int, postIDs []int) error {
	return r.inner.UpdatePinnedOrder(ctx, hubID, postIDs)
}
