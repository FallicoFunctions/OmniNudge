package models

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func floatPtr(v float64) *float64 { return &v }

func TestOmniChatMemoryEpisodeValidate(t *testing.T) {
	valid := func() OmniChatMemoryEpisode {
		return OmniChatMemoryEpisode{
			PersonaID:       1,
			OwnerUserID:     2,
			ConversationID:  3,
			Title:           "Mike clogged the McDonald's toilet",
			Summary:         "At 5am Mike destroyed the restroom.",
			Salience:        0.9,
			Distinctiveness: 0.95,
			Entities: []OmniChatMemoryEntityRef{
				{CanonicalName: "Mike", Kind: OmniChatMemoryEntityPerson},
			},
		}
	}

	tests := []struct {
		name    string
		mutate  func(*OmniChatMemoryEpisode)
		wantErr string
	}{
		{name: "valid", mutate: func(*OmniChatMemoryEpisode) {}},
		{
			name:    "missing persona",
			mutate:  func(e *OmniChatMemoryEpisode) { e.PersonaID = 0 },
			wantErr: "persona is required",
		},
		{
			// The schema check enforces this too. Catching it here means a bad
			// extraction never reaches the database as a constraint violation.
			name:    "conversation derived episode cannot be self tier",
			mutate:  func(e *OmniChatMemoryEpisode) { e.OwnerUserID = OmniChatMemoryTierSelf },
			wantErr: "cannot be self tier",
		},
		{
			name:    "blank title",
			mutate:  func(e *OmniChatMemoryEpisode) { e.Title = "   " },
			wantErr: "title is required",
		},
		{
			name:    "oversized title",
			mutate:  func(e *OmniChatMemoryEpisode) { e.Title = strings.Repeat("x", omniChatMemoryMaxTitle+1) },
			wantErr: "title exceeds",
		},
		{
			name:    "blank summary",
			mutate:  func(e *OmniChatMemoryEpisode) { e.Summary = "" },
			wantErr: "summary is required",
		},
		{
			name:    "salience above range",
			mutate:  func(e *OmniChatMemoryEpisode) { e.Salience = 1.5 },
			wantErr: "salience must be within",
		},
		{
			name:    "distinctiveness below range",
			mutate:  func(e *OmniChatMemoryEpisode) { e.Distinctiveness = -0.1 },
			wantErr: "distinctiveness must be within",
		},
		{
			name:    "valence out of range",
			mutate:  func(e *OmniChatMemoryEpisode) { e.EmotionalValence = floatPtr(-2) },
			wantErr: "emotional valence must be within",
		},
		{
			name:    "unknown entity kind",
			mutate:  func(e *OmniChatMemoryEpisode) { e.Entities[0].Kind = "vibe" },
			wantErr: "unknown entity kind",
		},
		{
			name: "too many entities",
			mutate: func(e *OmniChatMemoryEpisode) {
				for i := 0; i <= omniChatMemoryMaxEntities; i++ {
					e.Entities = append(e.Entities, OmniChatMemoryEntityRef{
						CanonicalName: "x", Kind: OmniChatMemoryEntityThing,
					})
				}
			},
			wantErr: "at most",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			episode := valid()
			tt.mutate(&episode)
			err := episode.Validate()
			if tt.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			require.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestOmniChatMemoryEpisodeNormalize(t *testing.T) {
	episode := OmniChatMemoryEpisode{
		Title:   "  Mike   clogged\tthe toilet  ",
		Summary: "  It   happened  ",
		Entities: []OmniChatMemoryEntityRef{
			{CanonicalName: "Mike", Kind: OmniChatMemoryEntityPerson, Aliases: []string{"mike", "Michael"}},
			{CanonicalName: "mike", Kind: OmniChatMemoryEntityPerson},
			{CanonicalName: "  ", Kind: OmniChatMemoryEntityPerson},
			{CanonicalName: "Nowhere", Kind: "bogus"},
		},
	}
	episode.Normalize()

	require.Equal(t, "Mike clogged the toilet", episode.Title)
	require.Equal(t, "It happened", episode.Summary)
	require.Equal(t, OmniChatMemoryStatusActive, episode.Status)

	// Case-insensitive duplicates collapse, blanks and unknown kinds drop, and
	// an alias identical to the canonical name is not kept twice.
	require.Len(t, episode.Entities, 1)
	require.Equal(t, "Mike", episode.Entities[0].CanonicalName)
	require.Equal(t, []string{"Michael"}, episode.Entities[0].Aliases)
}

// setupMemoryTestDB mirrors setupBanTestDB; memory tests need real SQL because
// the ranking they assert lives in the query, not in Go.
func setupMemoryTestDB(t *testing.T) (*pgxpool.Pool, func()) {
	t.Helper()
	pool, _, cleanup := setupBanTestDB(t)
	return pool, cleanup
}

type memoryFixture struct {
	userID    int
	otherID   int
	personaID int
}

func seedMemoryFixture(t *testing.T, pool *pgxpool.Pool, suffix string) memoryFixture {
	t.Helper()
	ctx := context.Background()
	var fixture memoryFixture

	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (username, username_normalized, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
		"memtest_"+suffix).Scan(&fixture.userID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (username, username_normalized, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
		"memother_"+suffix).Scan(&fixture.otherID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_personas (slug, name, system_prompt) VALUES ($1, 'Memtest', 'You are Memtest.') RETURNING id`,
		"memtest-persona-"+suffix).Scan(&fixture.personaID))

	return fixture
}

// insertMessage creates a real turn. source_message_id is a foreign key, so
// provenance can only ever point at a message that actually exists.
func insertMessage(t *testing.T, pool *pgxpool.Pool, conversationID int, role, content string) int {
	t.Helper()
	var id int
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO bot_messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id
	`, conversationID, role, content).Scan(&id))
	return id
}

func insertEpisode(t *testing.T, pool *pgxpool.Pool, personaID, ownerUserID int, title, summary string, salience, distinctiveness float64) int64 {
	t.Helper()
	var id int64
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO omnichat_memory_episodes
			(persona_id, owner_user_id, title, summary, salience, distinctiveness)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
	`, personaID, ownerUserID, title, summary, salience, distinctiveness).Scan(&id))
	return id
}

func linkEntity(t *testing.T, pool *pgxpool.Pool, personaID, ownerUserID int, name, kind string, episodeIDs ...int64) {
	t.Helper()
	ctx := context.Background()
	var entityID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO omnichat_memory_entities (persona_id, owner_user_id, canonical_name, kind)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (persona_id, COALESCE(owner_user_id, 0), lower(canonical_name)) DO UPDATE
		SET mention_count = omnichat_memory_entities.mention_count + 1
		RETURNING id
	`, personaID, ownerUserID, name, kind).Scan(&entityID))
	for _, episodeID := range episodeIDs {
		_, err := pool.Exec(ctx, `
			INSERT INTO omnichat_memory_episode_entities (episode_id, entity_id)
			VALUES ($1, $2) ON CONFLICT DO NOTHING
		`, episodeID, entityID)
		require.NoError(t, err)
	}
}

// TestOmniChatMemoryRecallPrefersDistinctiveEpisode is the acceptance test for
// character memory.
//
// Six memories mention the same place. Lexical rank alone cannot separate them
// -- it actually scores an ordinary drive-thru trip highest, because it repeats
// the place name in a short body. The one a person would actually mean is the
// strange one, and only salience and distinctiveness encode that.
func TestOmniChatMemoryRecallPrefersDistinctiveEpisode(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "mike")
	repo := NewOmniChatMemoryRepository(pool)

	memorable := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"Mike clogged the McDonalds toilet",
		"At 5am after the concert Mike destroyed the McDonalds restroom and we fled.", 0.98, 0.97)
	mundane := []int64{
		insertEpisode(t, pool, fixture.personaID, fixture.userID,
			"McDonalds fries opinion", "Mike said McDonalds fries beat Wendys fries.", 0.10, 0.08),
		insertEpisode(t, pool, fixture.personaID, fixture.userID,
			"Late night McDonalds run", "We grabbed McDonalds after the movie.", 0.12, 0.10),
		insertEpisode(t, pool, fixture.personaID, fixture.userID,
			"Mike dislikes the McRib", "Mike complained the McRib at McDonalds is bad.", 0.09, 0.12),
		insertEpisode(t, pool, fixture.personaID, fixture.userID,
			"McDonalds drive thru", "We went through the McDonalds drive thru before work.", 0.08, 0.06),
		insertEpisode(t, pool, fixture.personaID, fixture.userID,
			"McDonalds breakfast", "Mike got a McDonalds breakfast sandwich.", 0.07, 0.05),
	}

	all := append([]int64{memorable}, mundane...)
	linkEntity(t, pool, fixture.personaID, fixture.userID, "McDonalds", "place", all...)
	linkEntity(t, pool, fixture.personaID, fixture.userID, "Mike", "person", memorable, mundane[0], mundane[2], mundane[4])

	got, err := repo.Recall(context.Background(), fixture.personaID, fixture.userID,
		"Remember that one time we went to McDonalds?", DefaultOmniChatMemoryRecallWeights(), 6)
	require.NoError(t, err)
	require.NotEmpty(t, got, "a cue naming a known place must recall something")
	require.Equal(t, memorable, got[0].ID,
		"the distinctive episode must outrank the mundane ones that match the same words")
}

func TestOmniChatMemoryRecallIsScopedToOneUser(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "scope")
	repo := NewOmniChatMemoryRepository(pool)

	mine := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"My secret about Barcelona", "I told her I lost my passport in Barcelona.", 0.9, 0.9)
	linkEntity(t, pool, fixture.personaID, fixture.userID, "Barcelona", "place", mine)

	theirs := insertEpisode(t, pool, fixture.personaID, fixture.otherID,
		"Their secret about Barcelona", "They confessed something private about Barcelona.", 0.9, 0.9)
	linkEntity(t, pool, fixture.personaID, fixture.otherID, "Barcelona", "place", theirs)

	ctx := context.Background()
	weights := DefaultOmniChatMemoryRecallWeights()

	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID, "tell me about Barcelona", weights, 6)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, mine, got[0].ID, "a persona must never recall another user's memory")

	got, err = repo.Recall(ctx, fixture.personaID, fixture.otherID, "tell me about Barcelona", weights, 6)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, theirs, got[0].ID)

	// The self tier is a separate space and shares nothing with either user.
	got, err = repo.Recall(ctx, fixture.personaID, OmniChatMemoryTierSelf, "tell me about Barcelona", weights, 6)
	require.NoError(t, err)
	require.Empty(t, got, "self-tier recall must not reach relational memory")
}

// TestOmniChatMemoryTierCheckIsEnforcedBySchema proves the guarantee lives in
// the database rather than only in Go: a conversation-derived episode cannot be
// written as persona-global no matter which code path attempts it.
func TestOmniChatMemoryTierCheckIsEnforcedBySchema(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "tier")
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, conversation_id, title, summary)
		VALUES ($1, NULL, $2, 'leak', 'leak')
	`, fixture.personaID, conversationID)
	require.Error(t, err, "a conversation-derived episode must not be storable as self tier")
	require.Contains(t, err.Error(), "tier violation")
}

// The same write, refused above, is the entire point of a free character: her
// memory is whole, so what one person tells her another may hear. The
// permission is read off the persona and nothing else, which is why this test
// changes only the profile and repeats the identical insert.
func TestOmniChatMemoryTierOpensOnlyForFreeCharacters(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "freetier")
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	insertGlobal := func() error {
		_, err := pool.Exec(ctx, `
			INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, conversation_id, title, summary)
			VALUES ($1, NULL, $2, 'shared', 'told to her by someone')
		`, fixture.personaID, conversationID)
		return err
	}

	require.Error(t, insertGlobal(), "an ordinary character keeps the original guarantee")

	_, err := pool.Exec(ctx,
		`UPDATE bot_personas SET response_style_profile = 'direct_message' WHERE id = $1`,
		fixture.personaID)
	require.NoError(t, err)

	require.NoError(t, insertGlobal(), "a free character's conversation memory may be persona-global")

	// Moving her back off the profile would strand what is already written in a
	// tier no longer permitted to hold it. There is no owner to hand those
	// episodes to -- they came from more than one person -- so the change is
	// refused rather than silently repaired.
	_, err = pool.Exec(ctx,
		`UPDATE bot_personas SET response_style_profile = 'lean_narrative' WHERE id = $1`,
		fixture.personaID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot leave the free profile")

	// With nothing shared left, the same change is allowed again.
	_, err = pool.Exec(ctx,
		`DELETE FROM omnichat_memory_episodes WHERE persona_id = $1 AND owner_user_id IS NULL`,
		fixture.personaID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`UPDATE bot_personas SET response_style_profile = 'lean_narrative' WHERE id = $1`,
		fixture.personaID)
	require.NoError(t, err)
}

func TestOmniChatMemoryWatermarkLifecycle(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "watermark")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	last, failures, err := repo.GetWatermark(ctx, conversationID)
	require.NoError(t, err)
	require.Zero(t, last, "an unextracted conversation starts at zero")
	require.Zero(t, failures)

	// A failure must not advance the watermark, or the delta that failed would
	// be silently skipped instead of retried.
	require.NoError(t, repo.RecordExtractionFailure(ctx, conversationID, fixture.userID))
	last, failures, err = repo.GetWatermark(ctx, conversationID)
	require.NoError(t, err)
	require.Zero(t, last)
	require.Equal(t, 1, failures)

	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, 42, []OmniChatMemoryEpisode{{
		PersonaID:       fixture.personaID,
		OwnerUserID:     fixture.userID,
		ConversationID:  conversationID,
		Title:           "Something worth keeping",
		Summary:         "It happened.",
		Salience:        0.7,
		Distinctiveness: 0.8,
		Entities:        []OmniChatMemoryEntityRef{{CanonicalName: "Barcelona", Kind: OmniChatMemoryEntityPlace}},
	}}))
	last, failures, err = repo.GetWatermark(ctx, conversationID)
	require.NoError(t, err)
	require.Equal(t, 42, last, "a successful extraction advances the watermark")
	require.Zero(t, failures, "success clears the failure counter")

	// The watermark only ever moves forward: a late job carrying an older
	// delta must not rewind it and cause re-extraction.
	require.NoError(t, repo.SkipTo(ctx, conversationID, fixture.userID, 10))
	last, _, err = repo.GetWatermark(ctx, conversationID)
	require.NoError(t, err)
	require.Equal(t, 42, last)
}

func TestOmniChatMemoryRecordExtractionRollsBackOnInvalidEpisode(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "rollback")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	err := repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, 7, []OmniChatMemoryEpisode{
		{
			PersonaID: fixture.personaID, OwnerUserID: fixture.userID, ConversationID: conversationID,
			Title: "Good one", Summary: "Fine.", Salience: 0.5, Distinctiveness: 0.5,
		},
		{
			PersonaID: fixture.personaID, OwnerUserID: fixture.userID, ConversationID: conversationID,
			Title: "", Summary: "Missing a title.", Salience: 0.5, Distinctiveness: 0.5,
		},
	})
	require.Error(t, err)

	// Neither the valid episode nor the watermark may survive a rejected batch,
	// or the watermark would claim work that was never stored.
	var episodes int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episodes WHERE conversation_id = $1`, conversationID).Scan(&episodes))
	require.Zero(t, episodes)

	last, _, err := repo.GetWatermark(ctx, conversationID)
	require.NoError(t, err)
	require.Zero(t, last)
}

func TestOmniChatMemoryMarkRetrievedStrengthensRanking(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "strengthen")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	id := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"A memory", "Something happened in Lisbon.", 0.5, 0.5)

	require.NoError(t, repo.MarkRetrieved(ctx, []int64{id}))
	require.NoError(t, repo.MarkRetrieved(ctx, []int64{id}))

	var count int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT retrieval_count FROM omnichat_memory_episodes WHERE id = $1`, id).Scan(&count))
	require.Equal(t, 2, count)

	require.NoError(t, repo.MarkRetrieved(ctx, nil), "an empty batch is a no-op, not an error")
}

func TestOmniChatMemoryHideOwnedRemovesFromRecall(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "hide")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	id := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"Wrong memory", "She thinks I lived in Prague.", 0.9, 0.9)
	linkEntity(t, pool, fixture.personaID, fixture.userID, "Prague", "place", id)

	weights := DefaultOmniChatMemoryRecallWeights()
	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID, "tell me about Prague", weights, 6)
	require.NoError(t, err)
	require.Len(t, got, 1)

	// Another user must not be able to hide someone else's memory.
	require.Error(t, repo.HideOwned(ctx, id, fixture.otherID))

	require.NoError(t, repo.HideOwned(ctx, id, fixture.userID))
	got, err = repo.Recall(ctx, fixture.personaID, fixture.userID, "tell me about Prague", weights, 6)
	require.NoError(t, err)
	require.Empty(t, got, "a hidden memory must not be recalled")

	// Hiding withdraws the memory from recall but preserves the record.
	var status string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status FROM omnichat_memory_episodes WHERE id = $1`, id).Scan(&status))
	require.Equal(t, "user_hidden", status)
}

// ListForConversation backs the user-facing "what do you remember" surface.
// It is covered here mainly because provenance is the whole defence against a
// hallucinated memory: a user can only correct what they can see and trace.
func TestOmniChatMemoryListForConversation(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "list")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	messageID := insertMessage(t, pool, conversationID, "user", "I lost my passport in Barcelona.")

	valence := -0.4
	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, messageID, []OmniChatMemoryEpisode{{
		PersonaID:        fixture.personaID,
		OwnerUserID:      fixture.userID,
		ConversationID:   conversationID,
		SourceMessageID:  messageID,
		Title:            "Lost passport in Barcelona",
		Summary:          "He had to visit the consulate on day two.",
		Salience:         0.8,
		Distinctiveness:  0.7,
		EmotionalValence: &valence,
		Entities:         []OmniChatMemoryEntityRef{{CanonicalName: "Barcelona", Kind: OmniChatMemoryEntityPlace}},
	}}))

	got, total, err := repo.ListForConversation(ctx, conversationID, fixture.userID, 20)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, 1, total)
	require.Equal(t, "Lost passport in Barcelona", got[0].Title)
	require.Equal(t, OmniChatMemoryStatusActive, got[0].Status)
	require.Equal(t, conversationID, got[0].ConversationID)
	require.Equal(t, messageID, got[0].SourceMessageID, "provenance must survive the round trip")
	require.NotNil(t, got[0].EmotionalValence)
	require.InDelta(t, -0.4, *got[0].EmotionalValence, 0.001)
	require.False(t, got[0].RecordedAt.IsZero())
	require.False(t, got[0].IsSelf, "a memory from this conversation is shared history, not the character's own")

	// Scoped to the owner, like every other read in this repository.
	got, _, err = repo.ListForConversation(ctx, conversationID, fixture.otherID, 20)
	require.NoError(t, err)
	require.Empty(t, got, "another user must not read this conversation's memories")

	_, _, err = repo.ListForConversation(ctx, conversationID, fixture.userID, 0)
	require.Error(t, err, "an unbounded read must be rejected")
}

// The listing shows both tiers, because the character speaks from both. It can
// say it wandered a world the listener was never in, and this is the only place
// that claim can be checked.
//
// The second half is the rule the tier boundary rests on: widening the read to
// reach rows with no owner must not have widened it to reach rows with a
// different one.
func TestOmniChatMemoryListForConversationShowsTheCharactersOwnLife(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "listself")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	messageID := insertMessage(t, pool, conversationID, "user", "I lost my passport in Barcelona.")
	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, messageID, []OmniChatMemoryEpisode{{
		PersonaID:       fixture.personaID,
		OwnerUserID:     fixture.userID,
		ConversationID:  conversationID,
		SourceMessageID: messageID,
		Title:           "Lost passport in Barcelona",
		Summary:         "He had to visit the consulate on day two.",
		Salience:        0.8,
		Distinctiveness: 0.7,
	}}))

	selfID, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Wandered the main stage in OmniRave",
		Summary:   "Spent most of the set near the front and left before the encore.",
	})
	require.NoError(t, err)

	// Another user's relational memory, on the same persona and pointed at this
	// very conversation. Only a direct write can produce it, which is the point:
	// the query must refuse it on ownership, not on being unreachable.
	var intruderID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO omnichat_memory_episodes
			(persona_id, owner_user_id, conversation_id, title, summary)
		VALUES ($1, $2, $3, 'Someone else''s evening', 'Told to her by somebody else.')
		RETURNING id
	`, fixture.personaID, fixture.otherID, conversationID).Scan(&intruderID))

	got, total, err := repo.ListForConversation(ctx, conversationID, fixture.userID, 20)
	require.NoError(t, err)
	require.Len(t, got, 2)
	require.Equal(t, 2, total, "the total counts both tiers")

	// Shared history first, then the character's own.
	require.False(t, got[0].IsSelf)
	require.Equal(t, "Lost passport in Barcelona", got[0].Title)

	require.True(t, got[1].IsSelf, "a world event belongs to the character alone")
	require.Equal(t, selfID, got[1].ID)
	require.Equal(t, "Wandered the main stage in OmniRave", got[1].Title)
	require.Equal(t, OmniChatMemoryTierSelf, got[1].OwnerUserID, "a self-tier memory is owned by nobody")
	require.Zero(t, got[1].ConversationID, "a self-tier memory comes from no conversation")

	for _, episode := range got {
		require.NotEqual(t, intruderID, episode.ID, "another user's memory must never be listed")
	}

	// And it is not the reader's to take away, by the clause that already keeps
	// one user out of another's memories.
	require.Error(t, repo.HideOwned(ctx, selfID, fixture.userID),
		"the character's own life cannot be forgotten by a user")
}

// A character that belongs to a user has no self tier at all, so its listing is
// exactly what it always was. Asserted because the surface built on top of this
// must show no heading and no empty section for those characters, and that only
// holds if nothing comes back to hang one on.
func TestOmniChatMemoryListForConversationUserOwnedCharacterHasNoSelfTier(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "listowned")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	ownedPersonaID := seedOwnedPersona(t, pool, "listowned", fixture.userID, "private")

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, ownedPersonaID).Scan(&conversationID))

	messageID := insertMessage(t, pool, conversationID, "user", "I only tell you this.")
	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, messageID, []OmniChatMemoryEpisode{{
		PersonaID:       ownedPersonaID,
		OwnerUserID:     fixture.userID,
		ConversationID:  conversationID,
		SourceMessageID: messageID,
		Title:           "Kept to himself",
		Summary:         "Said he tells this character things he tells nobody.",
		Salience:        0.6,
		Distinctiveness: 0.6,
	}}))

	// A world event for another character must not bleed across: the self tier
	// is joined through this conversation's persona, not shown to everyone.
	_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Wandered the main stage in OmniRave",
		Summary:   "A different character's evening entirely.",
	})
	require.NoError(t, err)

	got, total, err := repo.ListForConversation(ctx, conversationID, fixture.userID, 20)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, 1, total)
	require.False(t, got[0].IsSelf, "a private character has no life of its own to show")
}

// Entity identity is per (persona, tier, name). Two users naming the same place
// must get separate entity rows, or one user's associations would pull in the
// other's episodes through a shared node.
func TestOmniChatMemoryEntitiesAreScopedPerUser(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "entityscope")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	for _, owner := range []int{fixture.userID, fixture.otherID} {
		var conversationID int
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
			owner, fixture.personaID).Scan(&conversationID))
		require.NoError(t, repo.RecordExtraction(ctx, conversationID, owner, 0, 5, []OmniChatMemoryEpisode{{
			PersonaID: fixture.personaID, OwnerUserID: owner, ConversationID: conversationID,
			Title: "A trip", Summary: "We talked about Lisbon.",
			Salience: 0.5, Distinctiveness: 0.5,
			Entities: []OmniChatMemoryEntityRef{{CanonicalName: "Lisbon", Kind: OmniChatMemoryEntityPlace}},
		}}))
	}

	var entityCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_entities WHERE persona_id = $1 AND lower(canonical_name) = 'lisbon'`,
		fixture.personaID).Scan(&entityCount))
	require.Equal(t, 2, entityCount, "each user gets their own entity node for the same name")
}

// Repeated mentions reinforce an entity rather than duplicating it, and aliases
// accumulate without repeating.
func TestOmniChatMemoryEntityUpsertAccumulates(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "upsert")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	episode := func(through int, aliases []string) []OmniChatMemoryEpisode {
		return []OmniChatMemoryEpisode{{
			PersonaID: fixture.personaID, OwnerUserID: fixture.userID, ConversationID: conversationID,
			Title: "Mention", Summary: "Talked about Mike.",
			Salience: 0.5, Distinctiveness: 0.5,
			Entities: []OmniChatMemoryEntityRef{{CanonicalName: "Mike", Kind: OmniChatMemoryEntityPerson, Aliases: aliases}},
		}}
	}
	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, 3, episode(3, []string{"Michael"})))
	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 3, 6, episode(6, []string{"Mikey", "Michael"})))

	var (
		rows     int
		mentions int
		aliases  []string
	)
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT count(*) OVER (), mention_count, aliases
		FROM omnichat_memory_entities
		WHERE persona_id = $1 AND owner_user_id = $2 AND lower(canonical_name) = 'mike'
	`, fixture.personaID, fixture.userID).Scan(&rows, &mentions, &aliases))

	require.Equal(t, 1, rows, "a repeated name must reinforce one node, not create another")
	require.Equal(t, 2, mentions)
	require.ElementsMatch(t, []string{"Michael", "Mikey"}, aliases)
}

// Account deletion has to take memories with it. This is the only mechanism
// doing that -- there is no memory-specific deletion path -- so the cascade is
// asserted rather than assumed.
func TestOmniChatMemoryCascadesOnUserDeletion(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "cascade")
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	repo := NewOmniChatMemoryRepository(pool)
	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, 1, []OmniChatMemoryEpisode{{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID, ConversationID: conversationID,
		Title: "Private thing", Summary: "Something they told her in confidence.",
		Salience: 0.9, Distinctiveness: 0.9,
		Entities: []OmniChatMemoryEntityRef{{CanonicalName: "Secret", Kind: OmniChatMemoryEntityTopic}},
	}}))

	count := func(table string) int {
		t.Helper()
		var n int
		require.NoError(t, pool.QueryRow(ctx,
			"SELECT count(*) FROM "+table+" WHERE owner_user_id = $1", fixture.userID).Scan(&n))
		return n
	}
	require.Equal(t, 1, count("omnichat_memory_episodes"))
	require.Equal(t, 1, count("omnichat_memory_entities"))
	require.Equal(t, 1, count("omnichat_memory_watermarks"))

	_, err := pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, fixture.userID)
	require.NoError(t, err)

	require.Zero(t, count("omnichat_memory_episodes"), "memories must not outlive the user")
	require.Zero(t, count("omnichat_memory_entities"))
	require.Zero(t, count("omnichat_memory_watermarks"))

	var links int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episode_entities`).Scan(&links))
	require.Zero(t, links, "association rows must not be orphaned")
}

// Deleting a persona removes memories of it. bot_conversations uses ON DELETE
// RESTRICT for personas, so this only happens for a persona with no
// conversations, but the memory tables must not block that path.
func TestOmniChatMemoryCascadesOnPersonaDeletion(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "personacascade")
	ctx := context.Background()

	insertEpisode(t, pool, fixture.personaID, fixture.userID, "A memory", "Of this persona.", 0.5, 0.5)

	_, err := pool.Exec(ctx, `DELETE FROM bot_personas WHERE id = $1`, fixture.personaID)
	require.NoError(t, err, "memory rows must not block deleting an unused persona")

	var remaining int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, fixture.personaID).Scan(&remaining))
	require.Zero(t, remaining)
}

// The watermark guard is what keeps two concurrent extractions from writing the
// same turns twice. The second writer started from a watermark that no longer
// exists, so its whole transaction -- episodes included -- must be discarded.
func TestOmniChatMemoryRecordExtractionRejectsStaleWatermark(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "race")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	episode := func(title string) []OmniChatMemoryEpisode {
		return []OmniChatMemoryEpisode{{
			PersonaID: fixture.personaID, OwnerUserID: fixture.userID, ConversationID: conversationID,
			Title: title, Summary: "Something happened.", Salience: 0.5, Distinctiveness: 0.5,
		}}
	}

	// Both workers read watermark 0 and extracted the same turns.
	require.NoError(t, repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, 20, episode("winner")))
	err := repo.RecordExtraction(ctx, conversationID, fixture.userID, 0, 20, episode("loser"))
	require.ErrorIs(t, err, ErrOmniChatMemoryRaced)

	var titles []string
	rows, err := pool.Query(ctx,
		`SELECT title FROM omnichat_memory_episodes WHERE conversation_id = $1`, conversationID)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var title string
		require.NoError(t, rows.Scan(&title))
		titles = append(titles, title)
	}
	require.Equal(t, []string{"winner"}, titles, "the losing extraction must leave nothing behind")

	last, _, err := repo.GetWatermark(ctx, conversationID)
	require.NoError(t, err)
	require.Equal(t, 20, last)
}

// A forgotten memory must not consume the page budget. Filtering client-side
// meant a user who had forgotten a lot could push their live memories off the
// only surface for correcting them, so the exclusion belongs in the query.
func TestOmniChatMemoryListForConversationExcludesForgotten(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "listhidden")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	hidden := insertEpisode(t, pool, fixture.personaID, fixture.userID, "Forgotten", "Withdrawn.", 0.5, 0.5)
	live := insertEpisode(t, pool, fixture.personaID, fixture.userID, "Still current", "Active.", 0.5, 0.5)
	_, err := pool.Exec(ctx,
		`UPDATE omnichat_memory_episodes SET conversation_id = $1 WHERE id = ANY($2)`,
		conversationID, []int64{hidden, live})
	require.NoError(t, err)
	require.NoError(t, repo.HideOwned(ctx, hidden, fixture.userID))

	// A page of one must contain the live memory, not the forgotten one that
	// happens to sort first.
	got, total, err := repo.ListForConversation(ctx, conversationID, fixture.userID, 1)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "Still current", got[0].Title)
	require.Equal(t, 1, total, "the total counts active memories only")
}

// The total describes the whole record, not the page, so a caller can tell a
// complete list from a truncated one.
func TestOmniChatMemoryListForConversationTotalIgnoresLimit(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "listtotal")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	ids := make([]int64, 0, 5)
	for i := 0; i < 5; i++ {
		ids = append(ids, insertEpisode(t, pool, fixture.personaID, fixture.userID,
			fmt.Sprintf("Memory %d", i), "Something.", 0.5, 0.5))
	}
	_, err := pool.Exec(ctx,
		`UPDATE omnichat_memory_episodes SET conversation_id = $1 WHERE id = ANY($2)`, conversationID, ids)
	require.NoError(t, err)

	got, total, err := repo.ListForConversation(ctx, conversationID, fixture.userID, 2)
	require.NoError(t, err)
	require.Len(t, got, 2, "the page respects the limit")
	require.Equal(t, 5, total, "the total does not")
}

func insertRetelling(t *testing.T, pool *pgxpool.Pool, personaID, ownerUserID int, root int64, title, summary string) int64 {
	t.Helper()
	var id int64
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO omnichat_memory_episodes
			(persona_id, owner_user_id, title, summary, salience, distinctiveness, retells_episode_id)
		VALUES ($1, $2, $3, $4, 0.5, 0.5, $5) RETURNING id
	`, personaID, ownerUserID, title, summary, root).Scan(&id))
	return id
}

// A story told many times is many rows. Recall has six slots, so without
// collapsing, one well-worn story would fill all of them and read as a stutter.
// The chain is one candidate, and the version surfaced is the newest -- the way
// it is currently told, drift and all -- while the original stays put.
func TestOmniChatMemoryRecallCollapsesRetellingsToTheCurrentVersion(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "retell")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	root := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"The McDonalds night", "Mike clogged the toilet at 5am and we left.", 0.9, 0.9)
	// Each retelling drifts a little further from the original.
	insertRetelling(t, pool, fixture.personaID, fixture.userID, root,
		"The McDonalds night", "Mike flooded the whole bathroom and the manager chased us.")
	newest := insertRetelling(t, pool, fixture.personaID, fixture.userID, root,
		"The McDonalds night", "Mike flooded the place and we were banned for life.")

	linkEntity(t, pool, fixture.personaID, fixture.userID, "McDonalds", "place", root, newest)

	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID,
		"remember that McDonalds night?", DefaultOmniChatMemoryRecallWeights(), 6)
	require.NoError(t, err)

	require.Len(t, got, 1, "three tellings of one story must occupy one slot, not three")
	require.Equal(t, newest, got[0].ID, "the version in circulation is the newest telling")
	require.Contains(t, got[0].Summary, "banned for life", "and its text, not the original's")
	require.Equal(t, 3, got[0].Tellings, "the chain length is reported")

	// The first account is untouched and still readable.
	var original string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT summary FROM omnichat_memory_episodes WHERE id = $1`, root).Scan(&original))
	require.Contains(t, original, "clogged the toilet",
		"retelling must never rewrite the original account")
}

// A cue may echo any version's wording. Matching only the newest would lose a
// story whose distinctive phrase belongs to how it was first told.
func TestOmniChatMemoryRecallMatchesAnyTellingInTheChain(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "retellmatch")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	root := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"The kayak thing", "We capsized near the lighthouse and lost the cooler.", 0.7, 0.8)
	newest := insertRetelling(t, pool, fixture.personaID, fixture.userID, root,
		"The kayak thing", "We went over and swam back.")

	// "lighthouse" appears only in the original account.
	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID,
		"that time at the lighthouse", DefaultOmniChatMemoryRecallWeights(), 6)
	require.NoError(t, err)
	require.Len(t, got, 1, "a phrase from the original must still find the story")
	require.Equal(t, newest, got[0].ID, "but the current telling is what is surfaced")
}

// The weight starts at zero deliberately: chain length is a signal this system
// has never had, so it is recorded and surfaced before it is trusted to rank.
func TestOmniChatMemoryRetellingWeightIsUnsetUntilMeasured(t *testing.T) {
	require.Zero(t, DefaultOmniChatMemoryRecallWeights().Retelling)
}

// seedOwnedPersona creates a character that belongs to a user. It is never a
// resident, so nothing may ever write it a self tier.
//
// Visibility is a parameter rather than a fixed 'private' because owned and
// private is the easy case: two conditions refuse it and either one alone would
// do. The case worth seeding is a published card -- owned, public and active --
// where the ownership condition is the only thing standing.
func seedOwnedPersona(t *testing.T, pool *pgxpool.Pool, suffix string, ownerUserID int, visibility string) int {
	t.Helper()
	var personaID int
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO bot_personas (slug, name, system_prompt, owner_user_id, visibility)
		VALUES ($1, 'Someone''s own', 'You belong to one person.', $2, $3)
		RETURNING id
	`, "memtest-owned-"+suffix, ownerUserID, visibility).Scan(&personaID))
	return personaID
}

// A world event belongs to the character, not to anybody, and it comes from no
// conversation. Both halves are asserted against the row itself rather than
// through the model, because the model could report whatever it was handed;
// what has to be true is what is on disk, since that is what recall reads and
// what the tier check constrains.
func TestOmniChatMemoryRecordWorldEventWritesTheSelfTier(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "worldevent")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	episodeID, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Came third on the Moon Circuit",
		Summary:   "Held the inside line through the last chicane and finished third.",
	})
	require.NoError(t, err)
	require.NotZero(t, episodeID)

	var (
		ownerUserID     *int
		conversationID  *int
		sourceMessageID *int
		salience        float64
		distinctiveness float64
		status          string
	)
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT owner_user_id, conversation_id, source_message_id, salience, distinctiveness, status
		FROM omnichat_memory_episodes WHERE id = $1
	`, episodeID).Scan(&ownerUserID, &conversationID, &sourceMessageID, &salience, &distinctiveness, &status))

	require.Nil(t, ownerUserID, "a world event belongs to the character, not to a user")
	require.Nil(t, conversationID, "a world event comes from no conversation")
	require.Nil(t, sourceMessageID)
	require.InDelta(t, OmniChatWorldEventSalience, salience, 0.001)
	require.InDelta(t, OmniChatWorldEventDistinctiveness, distinctiveness, 0.001)
	require.Equal(t, "active", status)
}

// Only platform characters have a self tier at all. A character that belongs
// to a user is never a resident, so the write is refused outright rather than
// filed somewhere safer.
func TestOmniChatMemoryRecordWorldEventRefusesUserOwnedCharacter(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "owned")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	ownedPersonaID := seedOwnedPersona(t, pool, "owned", fixture.userID, "private")

	_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: ownedPersonaID,
		Title:     "Came third on the Moon Circuit",
		Summary:   "A private character cannot have been there at all.",
	})
	require.ErrorIs(t, err, ErrOmniChatMemoryNotResident)

	// Refusing is only half of it: nothing may be left behind.
	var count int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, ownedPersonaID).Scan(&count))
	require.Zero(t, count, "a refused world event must write nothing")
}

// The case the ownership condition is actually for: a character somebody made
// and published. Owned, public and active is not an exotic state -- visibility
// defaults to public, is_active defaults to true, and creating a character card
// writes whatever visibility the user chose -- so it is what the predicate meets
// in practice. Every other owned fixture here is private as well, which means
// visibility refuses those on its own and the ownership condition could be
// deleted without a single test noticing.
func TestOmniChatMemoryRecordWorldEventRefusesAPublishedUserOwnedCharacter(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "ownedpublic")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	ownedPersonaID := seedOwnedPersona(t, pool, "ownedpublic", fixture.userID, "public")

	// Asserted rather than assumed: if the column defaults ever moved, this
	// fixture would quietly stop being the state under test.
	var (
		visibility string
		isActive   bool
	)
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT visibility, is_active FROM bot_personas WHERE id = $1`, ownedPersonaID).Scan(&visibility, &isActive))
	require.Equal(t, "public", visibility)
	require.True(t, isActive, "a published character is active, so only ownership refuses it")

	_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: ownedPersonaID,
		Title:     "Came third on the Moon Circuit",
		Summary:   "Publishing a character card does not put it in a world.",
	})
	require.ErrorIs(t, err, ErrOmniChatMemoryNotResident)

	var count int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, ownedPersonaID).Scan(&count))
	require.Zero(t, count, "a refused world event must write nothing")
}

// The same refusal covers every other reason a character is not a resident,
// and reports none of them differently: the caller must not be able to read
// the persona table through the shape of the error.
func TestOmniChatMemoryRecordWorldEventRefusesNonResidents(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "nonresident")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	var privatePersonaID, retiredPersonaID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, visibility)
		VALUES ('memtest-private-nonresident', 'Unlisted', 'x', 'private') RETURNING id
	`).Scan(&privatePersonaID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, is_active)
		VALUES ('memtest-retired-nonresident', 'Retired', 'x', FALSE) RETURNING id
	`).Scan(&retiredPersonaID))

	for name, personaID := range map[string]int{
		"private":     privatePersonaID,
		"retired":     retiredPersonaID,
		"nonexistent": 9_000_017,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
				PersonaID: personaID,
				Title:     "Came third on the Moon Circuit",
				Summary:   "Not a resident, so not a memory.",
			})
			require.ErrorIs(t, err, ErrOmniChatMemoryNotResident)
		})
	}

	// The platform character in the same fixture still works, so the refusals
	// above are about eligibility and not about the write being broken.
	_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Came third on the Moon Circuit",
		Summary:   "The resident's own race.",
	})
	require.NoError(t, err)
}

// A sanctioned character stops living, not just stops entering.
//
// The same predicate guards both doors on purpose. A withdrawn character keeps
// its world token for up to five minutes after the sanction lands, and during
// that window it can still act; without this, those minutes would keep writing
// themselves into a life the platform has decided is over. The cost is real and
// accepted: events from a session already in progress are dropped rather than
// queued, so the last thing a withdrawn character did is not remembered.
func TestOmniChatMemoryRecordWorldEventRefusesSanctionedCharacter(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "sanctioned")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	record := func() error {
		_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
			PersonaID: fixture.personaID,
			Title:     "Came third on the Moon Circuit",
			Summary:   "A race run while the platform was deciding otherwise.",
		})
		return err
	}

	// Unsanctioned first, so the refusals below are about the sanction and not
	// about the fixture being wrong.
	require.NoError(t, record())

	var sanctionID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO omnirave_persona_sanctions (persona_id, action, reason)
		VALUES ($1, 'withdrawn', 'taken out of circulation') RETURNING id
	`, fixture.personaID).Scan(&sanctionID))
	require.ErrorIs(t, record(), ErrOmniChatMemoryNotResident)

	// A suspension that has already lapsed is not a sanction in force, and the
	// character resumes its life with nothing having to run to let it.
	_, err := pool.Exec(ctx, `
		UPDATE omnirave_persona_sanctions
		SET action = 'suspended', expires_at = now() - interval '1 hour'
		WHERE id = $1
	`, sanctionID)
	require.NoError(t, err)
	require.NoError(t, record())
}

// The property the whole memory boundary exists to give: what a resident does
// in a world is the character's own, so every person who talks to that
// character finds it there, while what one person told it in private stays
// with that person.
func TestOmniChatMemoryWorldEventIsGlobalWhileRelationalMemoryStaysPrivate(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "global")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()
	weights := DefaultOmniChatMemoryRecallWeights()

	worldEventID, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Came third on the Moon Circuit",
		Summary:   "Finished third in the Moon Circuit final and stayed for the podium.",
	})
	require.NoError(t, err)

	// One user's private confidence, mentioning the same race.
	confidence := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"What the user admitted about the Moon Circuit",
		"The user said they had never told anyone they cried watching the Moon Circuit final.", 0.9, 0.9)

	// The self tier is the character's own life. A resident recalling for itself
	// reaches its own history and nothing anybody told it in private.
	selfRecall, err := repo.Recall(ctx, fixture.personaID, OmniChatMemoryTierSelf,
		"how did the Moon Circuit go?", weights, 6)
	require.NoError(t, err)
	require.Len(t, selfRecall, 1)
	require.Equal(t, worldEventID, selfRecall[0].ID,
		"a resident's world event is the character's own and is there for anyone")
	require.NotEqual(t, confidence, selfRecall[0].ID,
		"nothing a person said in private may reach the tier everyone reads")

	// The person who told it something private gets that back, and the
	// character's own life alongside it.
	mine, err := repo.Recall(ctx, fixture.personaID, fixture.userID,
		"how did the Moon Circuit go?", weights, 6)
	require.NoError(t, err)
	require.ElementsMatch(t, []int64{confidence, worldEventID}, recalledIDs(mine))

	// And the other user gets the character's life without the confidence. This
	// is the leak case under the widened query: self-tier rows are present, and
	// they change nothing about whose relational memory is reachable.
	theirs, err := repo.Recall(ctx, fixture.personaID, fixture.otherID,
		"how did the Moon Circuit go?", weights, 6)
	require.NoError(t, err)
	require.Equal(t, []int64{worldEventID}, recalledIDs(theirs),
		"another user must never see the first user's relational memory")
}

func recalledIDs(episodes []*OmniChatMemoryEpisode) []int64 {
	ids := make([]int64, 0, len(episodes))
	for _, episode := range episodes {
		ids = append(ids, episode.ID)
	}
	return ids
}

// TestOmniChatMemoryRecallGivesAResidentsLifeToEveryPlayer is the acceptance
// test for persona-as-player: what a character does in a world becomes part of
// who it is for everyone who talks to it.
//
// She spent a season racing. The person recalling here has never mentioned
// racing to her -- their whole history together is a sourdough starter and a
// wedding in Leeds -- and asks anyway. She races now, so she has something to
// say. Nothing was copied into that person's memory to make this happen: the
// self tier belongs to nobody and is read by everybody.
func TestOmniChatMemoryRecallGivesAResidentsLifeToEveryPlayer(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "racesnow")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()
	weights := DefaultOmniChatMemoryRecallWeights()

	// A season in the world, reported by the world.
	worldEventID, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Came third at the Moon Circuit",
		Summary:   "Held the inside line through the last chicane and finished the race third.",
	})
	require.NoError(t, err)

	// A player whose history with her has nothing to do with any of that.
	insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"The sourdough starter", "He named his sourdough starter after his grandmother.", 0.8, 0.7)
	insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"His sister's wedding", "He was dreading the toast at his sister's wedding in Leeds.", 0.8, 0.7)

	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID, "do you race?", weights, 6)
	require.NoError(t, err)
	require.Equal(t, []int64{worldEventID}, recalledIDs(got),
		"a player who has never discussed racing with her still finds that she races now")
	require.Equal(t, OmniChatMemoryTierSelf, got[0].OwnerUserID,
		"and it comes back marked as her own life, not as something they did together")
	require.True(t, got[0].IsSelf,
		"said outright rather than left to be inferred from an owner id of zero")
}

// A private character has no self tier to read, so nothing about it changes.
// The widened predicate is only ever a second branch over rows that, for a
// user's own character, do not exist.
func TestOmniChatMemoryRecallIsUnchangedForAPrivateCharacter(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "privaterecall")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()
	weights := DefaultOmniChatMemoryRecallWeights()

	ownedPersonaID := seedOwnedPersona(t, pool, "privaterecall", fixture.userID, "private")

	// The world would refuse to write this character a self tier, and does.
	_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: ownedPersonaID,
		Title:     "Came third at the Moon Circuit",
		Summary:   "A private character was never there to finish the race at all.",
	})
	require.ErrorIs(t, err, ErrOmniChatMemoryNotResident)

	ours := insertEpisode(t, pool, ownedPersonaID, fixture.userID,
		"The race we watched", "We watched the Moon Circuit race final together on his sofa.", 0.8, 0.8)

	got, err := repo.Recall(ctx, ownedPersonaID, fixture.userID, "do you race?", weights, 6)
	require.NoError(t, err)
	require.Equal(t, []int64{ours}, recalledIDs(got),
		"a private character's recall is its owner's relationship with it and nothing else")
	require.Equal(t, fixture.userID, got[0].OwnerUserID)
	require.False(t, got[0].IsSelf, "nothing here belongs to the character alone")

	var selfTierRows int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1 AND owner_user_id IS NULL`,
		ownedPersonaID).Scan(&selfTierRows))
	require.Zero(t, selfTierRows, "a user's own character has no self tier at all")
}

// Reading both tiers must not become a thumb on the scale for either. A world
// event competes on salience, distinctiveness and text match like anything
// else: it arrives unscored at the neutral midpoint, so a memory that mattered
// more still comes first.
func TestOmniChatMemoryRecallGivesTheSelfTierNoRankingAdvantage(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "notierbonus")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()
	weights := DefaultOmniChatMemoryRecallWeights()

	worldEventID, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "A race at the Moon Circuit",
		Summary:   "Finished the race mid-pack and went home.",
	})
	require.NoError(t, err)

	memorable := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"The race he crashed out of",
		"He crashed out of the race on the last lap and broke his wrist.", 0.98, 0.97)

	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID, "tell me about the race", weights, 6)
	require.NoError(t, err)
	require.ElementsMatch(t, []int64{memorable, worldEventID}, recalledIDs(got),
		"both tiers are candidates for the same cue")
	require.Equal(t, memorable, got[0].ID,
		"the more salient memory still wins, so no tier bonus crept into the score")
}

// The acceptance test for a character knowing it goes somewhere often.
//
// An agent files one memory per visit, so a resident left running racks up
// hundreds of near-identical evenings. Every one of them is kept -- they really
// happened, and a character that went a thousand times must not remember fifty
// -- and recall collapses them to the most recent, with the count attached.
func TestOmniChatMemoryRecordWorldEventLinksARepeatVisit(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "recurring")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	visit := func(summary string) int64 {
		t.Helper()
		id, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
			PersonaID: fixture.personaID,
			Title:     "Wandered the main stage in OmniRave",
			Summary:   summary,
		})
		require.NoError(t, err)
		return id
	}

	first := visit("Was in OmniRave for 12m. Wandered the main stage for 11m.")
	second := visit("Was in OmniRave for 40m. Wandered the main stage for 38m.")
	newest := visit("Was in OmniRave for 9m. Wandered the main stage for 8m.")

	// Every occurrence names the first, not the one before it, so the chain is
	// one level deep however long it gets.
	var firstLink *int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT recurs_episode_id FROM omnichat_memory_episodes WHERE id = $1`, first).Scan(&firstLink))
	require.Nil(t, firstLink, "the first visit is a recurrence of nothing")
	for _, later := range []int64{second, newest} {
		var root int64
		require.NoError(t, pool.QueryRow(ctx,
			`SELECT recurs_episode_id FROM omnichat_memory_episodes WHERE id = $1`, later).Scan(&root))
		require.Equal(t, first, root, "a repeat visit attaches to the first one")
	}

	// A different kind of visit is a different thing, not another instance.
	elsewhere, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Wandered the Underground in OmniRave",
		Summary:   "Was in OmniRave for 20m. Wandered the Underground for 19m.",
	})
	require.NoError(t, err)
	var elsewhereLink *int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT recurs_episode_id FROM omnichat_memory_episodes WHERE id = $1`, elsewhere).Scan(&elsewhereLink))
	require.Nil(t, elsewhereLink, "somewhere else is not the same thing again")

	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID,
		"do you go to the main stage?", DefaultOmniChatMemoryRecallWeights(), 6)
	require.NoError(t, err)
	require.Len(t, got, 1, "three visits to one place must occupy one slot, not three")
	require.Equal(t, newest, got[0].ID, "and the one surfaced is the most recent")
	require.Contains(t, got[0].Summary, "9m")
	require.Equal(t, 3, got[0].Occurrences, "the character knows how many times it has been")

	// Nothing was collapsed away: the record still holds every visit.
	var stored int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT count(*) FROM omnichat_memory_episodes
		WHERE persona_id = $1 AND title = 'Wandered the main stage in OmniRave'
	`, fixture.personaID).Scan(&stored))
	require.Equal(t, 3, stored, "every visit is kept, not folded into a counter")
}

// Volume must not buy rank. A character that goes somewhere nightly would
// otherwise have that place beat everything memorable it has ever done, purely
// because there is more of it.
func TestOmniChatMemoryRecallGivesALongRecurrenceChainNoRankingAdvantage(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "chainlength")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()
	weights := DefaultOmniChatMemoryRecallWeights()

	var newestVisit int64
	for i := 0; i < 50; i++ {
		id, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
			PersonaID: fixture.personaID,
			Title:     "Wandered the main stage in OmniRave",
			Summary:   "Stood near the front of the main stage and left before the encore.",
		})
		require.NoError(t, err)
		newestVisit = id
	}

	// One night that was not like the others.
	memorable := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"The night the main stage lost power",
		"The main stage cut out mid-set and the whole crowd sang the rest of it.", 0.98, 0.97)

	got, err := repo.Recall(ctx, fixture.personaID, fixture.userID, "tell me about the main stage", weights, 6)
	require.NoError(t, err)
	require.Equal(t, []int64{memorable, newestVisit}, recalledIDs(got),
		"fifty visits are one candidate, and the distinctive night still comes first")
	require.Equal(t, 50, got[1].Occurrences)
	require.Equal(t, 1, got[0].Occurrences, "a memory that happened once says so")
}

// The tier boundary is the whole reason the memory design can hold both a
// character's own life and one person's private history in one table. A
// recurrence link that crossed it would be a path between the two, so it is
// refused by the schema rather than by whichever caller remembers to check.
func TestOmniChatMemoryRecurrenceCannotCrossTiers(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "recurtier")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	selfID, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "Wandered the main stage in OmniRave",
		Summary:   "An evening nobody else was part of.",
	})
	require.NoError(t, err)
	relationalID := insertEpisode(t, pool, fixture.personaID, fixture.userID,
		"We talked about the main stage", "He said he had never been.", 0.5, 0.5)

	_, err = pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, title, summary, recurs_episode_id)
		VALUES ($1, $2, 'again', 'again', $3)
	`, fixture.personaID, fixture.userID, selfID)
	require.Error(t, err, "one person's memory must not be another instance of the character's own life")
	require.Contains(t, err.Error(), "omnichat_memory_episodes_recurrence_stays_in_tier")

	_, err = pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, title, summary, recurs_episode_id)
		VALUES ($1, NULL, 'again', 'again', $2)
	`, fixture.personaID, relationalID)
	require.Error(t, err, "and the character's own life must not continue somebody's private history")
	require.Contains(t, err.Error(), "omnichat_memory_episodes_recurrence_stays_in_tier")

	// A row cannot claim to be both a retelling and a recurrence either: those
	// are contradictory accounts of what it is, and the collapse key would have
	// no way to say which chain it belongs to.
	_, err = pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, title, summary, recurs_episode_id, retells_episode_id)
		VALUES ($1, NULL, 'again', 'again', $2, $2)
	`, fixture.personaID, selfID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "omnichat_memory_episodes_retells_or_recurs")
}

// Chain length is recorded and surfaced before it is trusted to rank, exactly
// as the retelling count is.
func TestOmniChatMemoryRecurrenceWeightIsUnsetUntilMeasured(t *testing.T) {
	require.Zero(t, DefaultOmniChatMemoryRecallWeights().Recurrence)
}

// A world event is untrusted text like any other: the world is a service, but
// what it reports still arrives over the wire.
func TestOmniChatMemoryRecordWorldEventBoundsItsText(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "bounds")
	repo := NewOmniChatMemoryRepository(pool)
	ctx := context.Background()

	_, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     "   ",
		Summary:   "A race with no name.",
	})
	require.Error(t, err, "a world event with no title is not a memory")

	episodeID, err := repo.RecordWorldEvent(ctx, OmniChatWorldEvent{
		PersonaID: fixture.personaID,
		Title:     strings.Repeat("x", omniChatMemoryMaxTitle+50),
		Summary:   "An oversized title is clamped rather than refused.",
	})
	require.NoError(t, err)

	var title string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT title FROM omnichat_memory_episodes WHERE id = $1`, episodeID).Scan(&title))
	require.Len(t, []rune(title), omniChatMemoryMaxTitle)
}
