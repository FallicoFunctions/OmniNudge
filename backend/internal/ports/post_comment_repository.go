package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// PostCommentRepository defines the interface for post comment persistence operations.
type PostCommentRepository interface {
	Create(ctx context.Context, comment *domain.PostComment) error
	GetByID(ctx context.Context, id int) (*domain.PostComment, error)
	GetUserCommentedPostIDs(ctx context.Context, userID int, postIDs []int) ([]int, error)
	GetUserVotedCommentIDs(ctx context.Context, userID int, commentIDs []int) ([]int, error)
	GetUserRepliedCommentIDs(ctx context.Context, userID int, commentIDs []int) ([]int, error)
	GetByPostID(ctx context.Context, postID int, sortBy string, limit, offset int, userID *int) ([]*domain.PostComment, error)
	GetReplies(ctx context.Context, parentCommentID int, sortBy string, limit, offset int, userID *int) ([]*domain.PostComment, error)
	GetByUserID(ctx context.Context, userID int, limit, offset int) ([]*domain.PostComment, error)
	Update(ctx context.Context, comment *domain.PostComment) error
	SetInboxRepliesDisabled(ctx context.Context, commentID, userID int, disabled bool) error
	SoftDelete(ctx context.Context, commentID int) error
	Vote(ctx context.Context, commentID int, userID int, isUpvote *bool) error
	GetReplyCount(ctx context.Context, commentID int) (int, error)
	MarkAsRemoved(ctx context.Context, commentID int, moderatorID int) error
	MarkAsApproved(ctx context.Context, commentID int) error
}
