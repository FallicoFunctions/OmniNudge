package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CachedRedditPost represents a Reddit post stored for feed mixing.
type CachedRedditPost struct {
	RedditPostID string    `json:"reddit_post_id"`
	Subreddit    string    `json:"subreddit"`
	Title        string    `json:"title"`
	Author       *string   `json:"author,omitempty"`
	Body         *string   `json:"body,omitempty"`
	URL          *string   `json:"url,omitempty"`
	ThumbnailURL *string   `json:"thumbnail_url,omitempty"`
	MediaType    *string   `json:"media_type,omitempty"`
	MediaURL     *string   `json:"media_url,omitempty"`
	Score        int       `json:"score"`
	NumComments  int       `json:"num_comments"`
	CreatedUTC   time.Time `json:"created_utc"`
	CacheKey     string    `json:"cache_key"`
	CachedAt     time.Time `json:"cached_at"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// RedditPostRepository manages cached Reddit posts.
type RedditPostRepository struct {
	pool *pgxpool.Pool
}

// NewRedditPostRepository creates a new RedditPostRepository.
func NewRedditPostRepository(pool *pgxpool.Pool) *RedditPostRepository {
	return &RedditPostRepository{pool: pool}
}

// UpsertPosts stores Reddit posts for future feed usage.
func (r *RedditPostRepository) UpsertPosts(ctx context.Context, posts []*CachedRedditPost) error {
	if len(posts) == 0 {
		return nil
	}

	query := `
		INSERT INTO reddit_posts (
			reddit_post_id, subreddit, title, author, body, url,
			thumbnail_url, media_type, media_url,
			score, num_comments, created_utc,
			cache_key, cached_at, expires_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		ON CONFLICT (reddit_post_id) DO UPDATE SET
			subreddit = EXCLUDED.subreddit,
			title = EXCLUDED.title,
			author = EXCLUDED.author,
			body = EXCLUDED.body,
			url = EXCLUDED.url,
			thumbnail_url = EXCLUDED.thumbnail_url,
			media_type = EXCLUDED.media_type,
			media_url = EXCLUDED.media_url,
			score = EXCLUDED.score,
			num_comments = EXCLUDED.num_comments,
			created_utc = EXCLUDED.created_utc,
			cache_key = EXCLUDED.cache_key,
			cached_at = EXCLUDED.cached_at,
			expires_at = EXCLUDED.expires_at
	`

	for _, post := range posts {
		if _, err := r.pool.Exec(ctx, query,
			post.RedditPostID,
			post.Subreddit,
			post.Title,
			post.Author,
			post.Body,
			post.URL,
			post.ThumbnailURL,
			post.MediaType,
			post.MediaURL,
			post.Score,
			post.NumComments,
			post.CreatedUTC,
			post.CacheKey,
			post.CachedAt,
			post.ExpiresAt,
		); err != nil {
			return err
		}
	}

	return nil
}
