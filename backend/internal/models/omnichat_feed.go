package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OmniChatFeedItem is one headline she may have seen, and who ran it.
type OmniChatFeedItem struct {
	Source      string    `json:"source"`
	Topic       string    `json:"topic"`
	Title       string    `json:"title"`
	Link        string    `json:"link"`
	PublishedAt time.Time `json:"published_at"`
}

// Topics she reads. Game news first because it is what these characters are
// actually about, and missing a patch is a worse tell than missing the news.
const (
	OmniChatFeedTopicGames = "games"
	OmniChatFeedTopicWorld = "world"
)

type OmniChatFeedRepository struct {
	pool *pgxpool.Pool
}

func NewOmniChatFeedRepository(pool *pgxpool.Pool) *OmniChatFeedRepository {
	return &OmniChatFeedRepository{pool: pool}
}

// Record stores what a refresh found, ignoring anything already seen.
//
// Re-running a refresh is safe and is the normal case: a feed repeats most of
// itself every time it is read, and only the new lines are new.
func (r *OmniChatFeedRepository) Record(ctx context.Context, items []OmniChatFeedItem) (int, error) {
	if r == nil || r.pool == nil || len(items) == 0 {
		return 0, nil
	}
	stored := 0
	var failures []error
	for _, item := range items {
		tag, err := r.pool.Exec(ctx, `
			INSERT INTO omnichat_feed_items(source, topic, title, link, published_at)
			VALUES($1,$2,$3,$4,$5)
			ON CONFLICT ON CONSTRAINT omnichat_feed_items_source_link_key DO NOTHING
		`, item.Source, item.Topic, item.Title, item.Link, item.PublishedAt)
		if err != nil {
			// One item is not the batch. A single overlong URL or odd
			// character should cost her that headline, not the rest of what
			// the source published -- the same rule the refresh already
			// applies one level up, where a source being down is not the run
			// failing.
			failures = append(failures, fmt.Errorf("omnichat feed: record %q: %w", item.Link, err))
			continue
		}
		stored += int(tag.RowsAffected())
	}
	return stored, errors.Join(failures...)
}

// Recent returns what she has seen lately, newest first.
//
// `within` is how far back counts as lately. People forget, and a headline from
// last month is not something anybody is still carrying around.
func (r *OmniChatFeedRepository) Recent(ctx context.Context, topic string, within time.Duration, limit int) ([]OmniChatFeedItem, error) {
	if r == nil || r.pool == nil || limit < 1 {
		return nil, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT source, topic, title, link, published_at
		FROM omnichat_feed_items
		WHERE topic = $1 AND published_at > NOW() - $2::interval
		ORDER BY published_at DESC
		LIMIT $3
	`, topic, fmt.Sprintf("%d seconds", int(within.Seconds())), limit)
	if err != nil {
		return nil, fmt.Errorf("omnichat feed: read recent: %w", err)
	}
	defer rows.Close()

	items := make([]OmniChatFeedItem, 0, limit)
	for rows.Next() {
		var item OmniChatFeedItem
		if err := rows.Scan(&item.Source, &item.Topic, &item.Title, &item.Link, &item.PublishedAt); err != nil {
			return nil, fmt.Errorf("omnichat feed: scan recent: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// Forget drops anything older than the window. Nothing here is authored, so
// nothing is lost, and an unbounded table of headlines serves nobody.
func (r *OmniChatFeedRepository) Forget(ctx context.Context, olderThan time.Duration) (int64, error) {
	if r == nil || r.pool == nil {
		return 0, nil
	}
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM omnichat_feed_items WHERE published_at < NOW() - $1::interval
	`, fmt.Sprintf("%d seconds", int(olderThan.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("omnichat feed: forget old items: %w", err)
	}
	return tag.RowsAffected(), nil
}
