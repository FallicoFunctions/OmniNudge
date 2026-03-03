package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// SavedItemsRepository defines the interface for saved items persistence operations.
type SavedItemsRepository interface {
	SavePost(ctx context.Context, userID, postID int) error
	RemovePost(ctx context.Context, userID, postID int) error
	SaveRedditComment(ctx context.Context, userID, commentID int) error
	RemoveRedditComment(ctx context.Context, userID, commentID int) error
	SavePostComment(ctx context.Context, userID, commentID int) error
	RemovePostComment(ctx context.Context, userID, commentID int) error
	IsPostSaved(ctx context.Context, userID, postID int) (bool, error)
	IsRedditCommentSaved(ctx context.Context, userID, commentID int) (bool, error)
	GetSavedPosts(ctx context.Context, userID int) ([]*domain.SavedPostOverview, error)
	GetSavedRedditComments(ctx context.Context, userID int) ([]*domain.RedditPostComment, error)
	GetSavedPostComments(ctx context.Context, userID int) ([]*domain.SavedPostComment, error)
	SaveRedditPost(ctx context.Context, userID int, post *domain.RedditPostDetails) error
	RemoveRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error
	IsRedditPostSaved(ctx context.Context, userID int, subreddit, redditPostID string) (bool, error)
	SaveRedditAPIComment(ctx context.Context, userID int, comment *domain.RedditAPICommentDetails) error
	RemoveRedditAPIComment(ctx context.Context, userID int, redditCommentID string) error
	IsRedditAPICommentSaved(ctx context.Context, userID int, redditCommentID string) (bool, error)
	GetSavedRedditAPIComments(ctx context.Context, userID int) ([]*domain.SavedRedditAPIComment, error)
	GetSavedRedditPosts(ctx context.Context, userID int) ([]*domain.SavedRedditPost, error)
	HidePost(ctx context.Context, userID, postID int) error
	UnhidePost(ctx context.Context, userID, postID int) error
	IsPostHidden(ctx context.Context, userID, postID int) (bool, error)
	GetHiddenPosts(ctx context.Context, userID int) ([]*domain.SavedPostOverview, error)
	HideRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error
	UnhideRedditPost(ctx context.Context, userID int, subreddit, redditPostID string) error
	IsRedditPostHidden(ctx context.Context, userID int, subreddit, redditPostID string) (bool, error)
	GetHiddenRedditPosts(ctx context.Context, userID int) ([]*domain.SavedRedditPost, error)
}
