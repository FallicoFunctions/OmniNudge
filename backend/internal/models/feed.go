package models

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// UnifiedFeedItem represents a hybrid feed entry (platform or Reddit).
type UnifiedFeedItem struct {
	ID             string    `json:"id"`
	Source         string    `json:"source"`
	PlatformID     *int      `json:"platform_id,omitempty"`
	RedditCacheID  *int      `json:"reddit_cache_id,omitempty"`
	RedditPostID   *string   `json:"reddit_post_id,omitempty"`
	Title          string    `json:"title"`
	Body           *string   `json:"body,omitempty"`
	AuthorID       *int      `json:"author_id,omitempty"`
	AuthorUsername *string   `json:"author_username,omitempty"`
	Subreddit      *string   `json:"subreddit,omitempty"`
	Score          int       `json:"score"`
	NumComments    int       `json:"num_comments"`
	CreatedAt      time.Time `json:"created_at"`
	MediaURL       *string   `json:"media_url,omitempty"`
	MediaType      *string   `json:"media_type,omitempty"`
	ThumbnailURL   *string   `json:"thumbnail_url,omitempty"`
}

// FeedRepository loads unified feed entries.
type FeedRepository struct {
	pool *pgxpool.Pool
}

// NewFeedRepository constructs a FeedRepository.
func NewFeedRepository(pool *pgxpool.Pool) *FeedRepository {
	return &FeedRepository{pool: pool}
}

// GetUnifiedFeed returns a combined feed of platform and cached Reddit posts.
func (r *FeedRepository) GetUnifiedFeed(ctx context.Context, sortBy string, limit, offset int, sourceFilter string) ([]*UnifiedFeedItem, error) {
	orderBy := "created_at DESC"
	if sortBy == "hot" || sortBy == "score" {
		orderBy = "score DESC, created_at DESC"
	}

	query := fmt.Sprintf(`
		SELECT
			source,
			platform_id,
			reddit_cache_id,
			reddit_post_id,
			title,
			body,
			author_id,
			author_username,
			subreddit,
			score,
			num_comments,
			created_at,
			media_url,
			media_type,
			thumbnail_url
		FROM (
			SELECT
				'platform' AS source,
				p.id AS platform_id,
				NULL::INTEGER AS reddit_cache_id,
				NULL::TEXT AS reddit_post_id,
				p.title,
				p.body,
				p.author_id,
				u.username AS author_username,
				NULL::TEXT AS subreddit,
				p.score,
				p.num_comments,
				p.created_at,
				p.media_url,
				p.media_type,
				p.thumbnail_url
			FROM platform_posts p
			JOIN users u ON p.author_id = u.id
			WHERE p.is_deleted = FALSE

			UNION ALL

			SELECT
				'reddit' AS source,
				NULL::INTEGER AS platform_id,
				rp.id AS reddit_cache_id,
				rp.reddit_post_id,
				rp.title,
				rp.body,
				NULL::INTEGER AS author_id,
				rp.author AS author_username,
				rp.subreddit,
				rp.score,
				rp.num_comments,
				rp.created_utc AS created_at,
				rp.media_url,
				rp.media_type,
				rp.thumbnail_url
			FROM reddit_posts rp
			WHERE rp.expires_at > NOW()
		) feed
		WHERE ($3 = '' OR feed.source = $3)
		ORDER BY %s
		LIMIT $1 OFFSET $2
	`, orderBy)

	rows, err := r.pool.Query(ctx, query, limit, offset, sourceFilter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*UnifiedFeedItem
	for rows.Next() {
		var (
			source         string
			platformID     sql.NullInt64
			redditCacheID  sql.NullInt64
			redditPostID   sql.NullString
			title          string
			body           sql.NullString
			authorID       sql.NullInt64
			authorUsername sql.NullString
			subreddit      sql.NullString
			score          int
			numComments    int
			createdAt      time.Time
			mediaURL       sql.NullString
			mediaType      sql.NullString
			thumbnailURL   sql.NullString
		)

		if err := rows.Scan(
			&source,
			&platformID,
			&redditCacheID,
			&redditPostID,
			&title,
			&body,
			&authorID,
			&authorUsername,
			&subreddit,
			&score,
			&numComments,
			&createdAt,
			&mediaURL,
			&mediaType,
			&thumbnailURL,
		); err != nil {
			return nil, err
		}

		item := &UnifiedFeedItem{
			Source:         source,
			Title:          title,
			Score:          score,
			NumComments:    numComments,
			CreatedAt:      createdAt,
			Body:           nullableString(body),
			AuthorUsername: nullableString(authorUsername),
			Subreddit:      nullableString(subreddit),
			MediaURL:       nullableString(mediaURL),
			MediaType:      nullableString(mediaType),
			ThumbnailURL:   nullableString(thumbnailURL),
		}
		if platformID.Valid {
			id := int(platformID.Int64)
			item.PlatformID = &id
			item.ID = fmt.Sprintf("platform:%d", id)
			if authorID.Valid {
				aid := int(authorID.Int64)
				item.AuthorID = &aid
			}
		}
		if redditCacheID.Valid {
			id := int(redditCacheID.Int64)
			item.RedditCacheID = &id
			item.ID = fmt.Sprintf("reddit:%d", id)
		}
		if redditPostID.Valid {
			val := redditPostID.String
			item.RedditPostID = &val
			if item.ID == "" {
				item.ID = fmt.Sprintf("reddit:%s", val)
			}
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

func nullableString(ns sql.NullString) *string {
	if ns.Valid {
		val := ns.String
		return &val
	}
	return nil
}
