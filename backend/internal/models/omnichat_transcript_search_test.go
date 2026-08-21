package models

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func seedSearchConversation(t *testing.T) (*BotMessageRepository, int, *pgxpool.Pool, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	user := &User{
		Username:     fmt.Sprintf("omnichat_search_%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	require.NoError(t, NewUserRepository(db.Pool).Create(ctx, user))

	persona, err := NewBotPersonaRepository(db.Pool).CreateOwned(ctx, user.ID, &BotPersona{
		Slug:               fmt.Sprintf("u%d-search-%d", user.ID, time.Now().UnixNano()),
		Name:               "Search Persona",
		Category:           PersonaCategoryOriginal,
		Visibility:         "private",
		SourceFormat:       "native",
		SystemPrompt:       "Look things up.",
		AlternateGreetings: []string{},
		Tags:               []string{},
		GalleryURLs:        []string{},
		ExtensionsJSON:     json.RawMessage(`{}`),
	})
	require.NoError(t, err)

	conversation, err := NewBotConversationRepository(db.Pool).
		CreateWithMessages(ctx, user.ID, persona.ID, nil, nil, nil)
	require.NoError(t, err)

	return NewBotMessageRepository(db.Pool), conversation.ID, db.Pool, db.Close
}

// A second conversation inside the same database. Seeding another one through
// the helper would reset the data this one is standing on.
func seedSiblingConversation(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	ctx := context.Background()

	var userID, personaID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID))
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM bot_personas ORDER BY id LIMIT 1`).Scan(&personaID))

	conversation, err := NewBotConversationRepository(pool).
		CreateWithMessages(ctx, userID, personaID, nil, nil, nil)
	require.NoError(t, err)
	return conversation.ID
}

// The case this exists for. Something said once, long ago, that no summary
// would have thought worth keeping -- and which the context window no longer
// reaches. A person scrolls up and reads it.
func TestSearchOlderThanFindsAnExchangeNoSummaryWouldHaveKept(t *testing.T) {
	repo, conversationID, _, cleanup := seedSearchConversation(t)
	defer cleanup()
	ctx := context.Background()

	buried, err := repo.Create(ctx, conversationID, BotMessageRoleUser,
		"We ended up at that awful McDonald's on Rivington at 3am.", false)
	require.NoError(t, err)

	// Plenty of forgettable turns on top of it.
	for i := 0; i < 40; i++ {
		_, err := repo.Create(ctx, conversationID, BotMessageRoleAssistant,
			fmt.Sprintf("Some ordinary reply number %d.", i), false)
		require.NoError(t, err)
	}
	newest, err := repo.Create(ctx, conversationID, BotMessageRoleUser, "the latest turn", false)
	require.NoError(t, err)

	found, err := repo.SearchOlderThan(ctx, conversationID, newest.ID,
		"remember that time we went to McDonald's?", 4)
	require.NoError(t, err)
	require.NotEmpty(t, found)
	require.Equal(t, buried.ID, found[0].ID, "the actual exchange ranks first")
	require.Contains(t, found[0].Content, "Rivington")
}

// A conversational cue shares almost no words with the message it should find.
// plainto_tsquery ANDs its terms, so it would require every one of them in a
// single message and match nothing at all.
func TestSearchOlderThanMatchesAConversationalCue(t *testing.T) {
	repo, conversationID, _, cleanup := seedSearchConversation(t)
	defer cleanup()
	ctx := context.Background()

	target, err := repo.Create(ctx, conversationID, BotMessageRoleAssistant,
		"My sister moved to Lisbon in the spring.", false)
	require.NoError(t, err)
	newest, err := repo.Create(ctx, conversationID, BotMessageRoleUser, "unrelated latest turn", false)
	require.NoError(t, err)

	found, err := repo.SearchOlderThan(ctx, conversationID, newest.ID,
		"hey, whereabouts did you say your sister ended up living again?", 4)
	require.NoError(t, err)
	require.NotEmpty(t, found, "an OR query matches; an AND query could not")
	require.Equal(t, target.ID, found[0].ID)
}

func TestSearchOlderThanStaysInsideItsBounds(t *testing.T) {
	repo, conversationID, pool, cleanup := seedSearchConversation(t)
	defer cleanup()
	ctx := context.Background()

	older, err := repo.Create(ctx, conversationID, BotMessageRoleUser, "kayaking in Norway", false)
	require.NoError(t, err)
	failed, err := repo.Create(ctx, conversationID, BotMessageRoleAssistant, "kayaking in Norway", true)
	require.NoError(t, err)
	newer, err := repo.Create(ctx, conversationID, BotMessageRoleUser, "kayaking in Norway", false)
	require.NoError(t, err)

	found, err := repo.SearchOlderThan(ctx, conversationID, newer.ID, "kayaking", 10)
	require.NoError(t, err)

	ids := make(map[int]bool, len(found))
	for _, message := range found {
		ids[message.ID] = true
	}
	require.True(t, ids[older.ID], "older matches are the point")
	require.False(t, ids[newer.ID], "she already has the window; repeating it wastes the prompt")
	require.False(t, ids[failed.ID], "a failed turn was never said to anybody")

	// Another conversation's messages are never reachable.
	sibling := seedSiblingConversation(t, pool)
	_, err = repo.Create(ctx, sibling, BotMessageRoleUser, "kayaking in Norway", false)
	require.NoError(t, err)

	stillFound, err := repo.SearchOlderThan(ctx, conversationID, newer.ID, "kayaking", 10)
	require.NoError(t, err)
	require.Len(t, stillFound, len(found), "a different conversation adds nothing")
}

func TestSearchOlderThanRefusesAnEmptyCue(t *testing.T) {
	repo, conversationID, _, cleanup := seedSearchConversation(t)
	defer cleanup()
	ctx := context.Background()

	_, err := repo.Create(ctx, conversationID, BotMessageRoleUser, "something", false)
	require.NoError(t, err)

	for _, cue := range []string{"", "   ", "!!! ???"} {
		found, err := repo.SearchOlderThan(ctx, conversationID, 99999, cue, 4)
		require.NoError(t, err, cue)
		require.Empty(t, found, "a cue with no lexemes must not match everything: %q", cue)
	}
}
