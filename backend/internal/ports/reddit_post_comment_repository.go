package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// RedditPostCommentRepository defines the interface for Reddit post comment persistence operations.
type RedditPostCommentRepository interface {
	Create(ctx context.Context, comment *domain.RedditPostComment) error
	GetByRedditPostWithUserVotes(ctx context.Context, subreddit, postID string, userID int) ([]*domain.RedditPostComment, error)
	GetByRedditPost(ctx context.Context, subreddit, postID string) ([]*domain.RedditPostComment, error)
	GetByID(ctx context.Context, id int) (*domain.RedditPostComment, error)
	Update(ctx context.Context, id int, content string) error
	SetInboxRepliesDisabled(ctx context.Context, id int, userID int, disabled bool) error
	Delete(ctx context.Context, id int) error
	GetUserVote(ctx context.Context, commentID, userID int) (int, error)
	SetVote(ctx context.Context, commentID, userID, voteType int) error
}
