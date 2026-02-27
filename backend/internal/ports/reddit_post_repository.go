package ports

import (
	"context"

	"github.com/omninudge/backend/internal/domain"
)

// RedditPostRepository defines persistence operations for cached Reddit posts.
type RedditPostRepository interface {
	UpsertPosts(ctx context.Context, posts []*domain.CachedRedditPost) error
}
