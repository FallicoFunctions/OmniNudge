package ports

import (
	"context"

	"github.com/omninudge/backend/internal/models"
)

// WallPostRepository defines persistence operations for profile wall posts.
type WallPostRepository interface {
	Create(ctx context.Context, post *models.WallPost) error
	GetByProfileUserID(ctx context.Context, profileUserID, viewerID, limit, offset int) ([]*models.WallPost, error)
	GetPendingByProfileUserID(ctx context.Context, profileUserID, limit, offset int) ([]*models.WallPost, error)
	ApprovePost(ctx context.Context, id int) error
	GetWallStats(ctx context.Context, profileUserID int) (models.WallStats, error)
	GetByID(ctx context.Context, id int) (*models.WallPost, error)
	SoftDelete(ctx context.Context, id int) error
	SetPostReaction(ctx context.Context, wallPostID, userID int, reaction models.ReactionType) (liked, disliked bool, likeCount, dislikeCount int, err error)
	CreateComment(ctx context.Context, comment *models.WallPostComment) error
	GetComments(ctx context.Context, wallPostID, viewerID, limit, offset int) ([]*models.WallPostComment, error)
	GetCommentByID(ctx context.Context, id int) (*models.WallPostComment, error)
	DeleteComment(ctx context.Context, id int) error
	SetCommentReaction(ctx context.Context, commentID, userID int, reaction models.ReactionType) (liked, disliked bool, likeCount, dislikeCount int, err error)
}
