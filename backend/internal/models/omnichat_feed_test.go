package models

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func feedItem(source, title string, age time.Duration) OmniChatFeedItem {
	return OmniChatFeedItem{
		Source:      source,
		Topic:       OmniChatFeedTopicGames,
		Title:       title,
		Link:        "https://example.test/" + title,
		PublishedAt: time.Now().Add(-age),
	}
}

func TestAFeedRepeatsItselfAndOnlyTheNewLinesAreNew(t *testing.T) {
	// The normal case, every single day: a source republishes most of what it
	// published yesterday, and re-reading it must not duplicate anything.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	repo := NewOmniChatFeedRepository(pool)
	ctx := context.Background()

	first := []OmniChatFeedItem{
		feedItem("PC Gamer", "A patch landed", time.Hour),
		feedItem("PC Gamer", "A studio closed", 2*time.Hour),
	}
	stored, err := repo.Record(ctx, first)
	require.NoError(t, err)
	require.Equal(t, 2, stored)

	// Read again, with one new headline on top.
	second := append([]OmniChatFeedItem{feedItem("PC Gamer", "Something else", time.Minute)}, first...)
	stored, err = repo.Record(ctx, second)
	require.NoError(t, err)
	require.Equal(t, 1, stored, "only the new line is new")
}

func TestTheSameStoryFromTwoSourcesIsTwoStories(t *testing.T) {
	// Uniqueness is per source, not per link. Two outlets covering the same
	// thing is two people mentioning it, which is worth knowing.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	repo := NewOmniChatFeedRepository(pool)
	ctx := context.Background()

	shared := "https://example.test/same-story"
	stored, err := repo.Record(ctx, []OmniChatFeedItem{
		{Source: "One", Topic: OmniChatFeedTopicWorld, Title: "A thing happened", Link: shared, PublishedAt: time.Now()},
		{Source: "Two", Topic: OmniChatFeedTopicWorld, Title: "A thing happened", Link: shared, PublishedAt: time.Now()},
	})
	require.NoError(t, err)
	require.Equal(t, 2, stored)
}

func TestSheReadsTheNewestFirstAndOnlyWhatIsRecent(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	repo := NewOmniChatFeedRepository(pool)
	ctx := context.Background()

	_, err := repo.Record(ctx, []OmniChatFeedItem{
		feedItem("PC Gamer", "Yesterday", 24*time.Hour),
		feedItem("PC Gamer", "This morning", 2*time.Hour),
		feedItem("PC Gamer", "Last year", 365*24*time.Hour),
	})
	require.NoError(t, err)

	found, err := repo.Recent(ctx, OmniChatFeedTopicGames, 48*time.Hour, 10)
	require.NoError(t, err)
	require.Len(t, found, 2, "last year is not lately")
	require.Equal(t, "This morning", found[0].Title)
	require.Equal(t, "Yesterday", found[1].Title)
}

func TestSheSkimsRatherThanMemorises(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	repo := NewOmniChatFeedRepository(pool)
	ctx := context.Background()

	items := make([]OmniChatFeedItem, 0, 20)
	for index := range 20 {
		items = append(items, feedItem("PC Gamer", string(rune('a'+index)), time.Duration(index)*time.Minute))
	}
	_, err := repo.Record(ctx, items)
	require.NoError(t, err)

	found, err := repo.Recent(ctx, OmniChatFeedTopicGames, 48*time.Hour, 3)
	require.NoError(t, err)
	require.Len(t, found, 3)
}

func TestOnlyTheTopicAskedForComesBack(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	repo := NewOmniChatFeedRepository(pool)
	ctx := context.Background()

	_, err := repo.Record(ctx, []OmniChatFeedItem{
		feedItem("PC Gamer", "A patch landed", time.Hour),
		{Source: "BBC", Topic: OmniChatFeedTopicWorld, Title: "Elsewhere",
			Link: "https://example.test/world", PublishedAt: time.Now()},
	})
	require.NoError(t, err)

	games, err := repo.Recent(ctx, OmniChatFeedTopicGames, 48*time.Hour, 10)
	require.NoError(t, err)
	require.Len(t, games, 1)
	require.Equal(t, "A patch landed", games[0].Title)
}

func TestOldHeadlinesAreForgottenAndRecentOnesAreNot(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	repo := NewOmniChatFeedRepository(pool)
	ctx := context.Background()

	_, err := repo.Record(ctx, []OmniChatFeedItem{
		feedItem("PC Gamer", "Ancient", 400*24*time.Hour),
		feedItem("PC Gamer", "Fresh", time.Hour),
	})
	require.NoError(t, err)

	removed, err := repo.Forget(ctx, 10*24*time.Hour)
	require.NoError(t, err)
	require.Equal(t, int64(1), removed)

	found, err := repo.Recent(ctx, OmniChatFeedTopicGames, 48*time.Hour, 10)
	require.NoError(t, err)
	require.Len(t, found, 1)
	require.Equal(t, "Fresh", found[0].Title)
}

func TestARepositoryWithNothingToDoDoesNothing(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	repo := NewOmniChatFeedRepository(pool)
	ctx := context.Background()

	stored, err := repo.Record(ctx, nil)
	require.NoError(t, err)
	require.Zero(t, stored)

	found, err := repo.Recent(ctx, OmniChatFeedTopicGames, time.Hour, 0)
	require.NoError(t, err)
	require.Empty(t, found, "asking for nothing returns nothing rather than everything")
}
