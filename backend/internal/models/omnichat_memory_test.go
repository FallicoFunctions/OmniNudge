package models

import (
	"context"
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
	require.Contains(t, err.Error(), "omnichat_memory_episodes_tier_check")
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

	got, err := repo.ListForConversation(ctx, conversationID, fixture.userID, 20)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "Lost passport in Barcelona", got[0].Title)
	require.Equal(t, OmniChatMemoryStatusActive, got[0].Status)
	require.Equal(t, conversationID, got[0].ConversationID)
	require.Equal(t, messageID, got[0].SourceMessageID, "provenance must survive the round trip")
	require.NotNil(t, got[0].EmotionalValence)
	require.InDelta(t, -0.4, *got[0].EmotionalValence, 0.001)
	require.False(t, got[0].RecordedAt.IsZero())

	// Scoped to the owner, like every other read in this repository.
	got, err = repo.ListForConversation(ctx, conversationID, fixture.otherID, 20)
	require.NoError(t, err)
	require.Empty(t, got, "another user must not read this conversation's memories")

	_, err = repo.ListForConversation(ctx, conversationID, fixture.userID, 0)
	require.Error(t, err, "an unbounded read must be rejected")
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
