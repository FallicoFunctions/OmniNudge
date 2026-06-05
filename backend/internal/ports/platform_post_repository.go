package ports

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
)

// PlatformPostRepository defines persistence operations for platform posts.
type PlatformPostRepository interface {
	Create(ctx context.Context, post *domain.PlatformPost) error
	GetByID(ctx context.Context, id int) (*domain.PlatformPost, error)
	GetByIDWithUser(ctx context.Context, id int, userID *int) (*domain.PlatformPost, error)
	GetFeed(ctx context.Context, sortBy string, limit, offset int) ([]*domain.PlatformPost, error)
	GetByAuthor(ctx context.Context, authorID int, limit, offset int) ([]*domain.PlatformPost, error)
	GetByHub(ctx context.Context, hubID int, sortBy string, limit, offset int) ([]*domain.PlatformPost, error)
	GetByHubExcludingAuthors(ctx context.Context, hubID int, sortBy string, limit, offset int, viewerID *int, excludeAuthorIDs []int) ([]*domain.PlatformPost, error)
	GetByHubWithUser(ctx context.Context, hubID int, sortBy string, limit, offset int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetByHubWithUserExcludingPinned(ctx context.Context, hubID int, sortBy string, limit, offset int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetPinnedByHubWithUser(ctx context.Context, hubID int, limit int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetByHubWithCursor(ctx context.Context, hubID int, sortBy string, limit int, cursor *domain.PlatformPostCursor, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetByHubWithCursorExcludingPinned(ctx context.Context, hubID int, sortBy string, limit int, cursor *domain.PlatformPostCursor, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetBySubredditWithUser(ctx context.Context, subreddit string, sortBy string, limit, offset int, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetBySubredditWithCursor(ctx context.Context, subreddit string, sortBy string, limit int, cursor *domain.PlatformPostCursor, userID *int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetByTags(ctx context.Context, tags []string, limit, offset int) ([]*domain.PlatformPost, error)
	Update(ctx context.Context, post *domain.PlatformPost) error
	SoftDelete(ctx context.Context, postID int) error
	IncrementViewCount(ctx context.Context, postID int) error
	GetUserVotedPostIDs(ctx context.Context, userID int, postIDs []int) ([]int, error)
	UpdateCreatedAt(ctx context.Context, postID int, createdAt time.Time) error
	Vote(ctx context.Context, postID int, userID int, isUpvote *bool) error
	GetPopularFeed(ctx context.Context, subscribedHubIDs []int, sort string, limit, offset int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetPopularFeedWithCursor(ctx context.Context, subscribedHubIDs []int, sort string, limit int, cursor *domain.PlatformPostCursor, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetAllFeed(ctx context.Context, sort string, limit, offset int, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	GetAllFeedWithCursor(ctx context.Context, sort string, limit int, cursor *domain.PlatformPostCursor, startTime, endTime *time.Time) ([]*domain.PlatformPost, error)
	MarkAsRemoved(ctx context.Context, postID int, moderatorID int) error
	MarkAsApproved(ctx context.Context, postID int) error
	LockPost(ctx context.Context, postID int) error
	UnlockPost(ctx context.Context, postID int) error
	PinPost(ctx context.Context, postID int) error
	UnpinPost(ctx context.Context, postID int) error
	GetPinnedIDsByHub(ctx context.Context, hubID int) ([]int, error)
	UpdatePinnedOrder(ctx context.Context, hubID int, postIDs []int) error
}
