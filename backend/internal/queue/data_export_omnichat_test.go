package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
)

// setupOmniChatExportDB gives each test a real database, because these
// exporters are almost entirely SQL and a fake would only test the fake.
func setupOmniChatExportDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	db, err := database.NewTest()
	require.NoError(t, err)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	t.Cleanup(db.Close)

	return db.Pool
}

type omniChatExportFixture struct {
	userID         int
	otherUserID    int
	personaID      int
	ownedPersonaID int
	conversationID int
	messageIDs     []int
}

func seedOmniChatExport(t *testing.T, pool *pgxpool.Pool, suffix string) omniChatExportFixture {
	t.Helper()
	ctx := context.Background()
	var fixture omniChatExportFixture

	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (username, username_normalized, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
		"exp_"+suffix).Scan(&fixture.userID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (username, username_normalized, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
		"expother_"+suffix).Scan(&fixture.otherUserID))

	// A platform-owned persona: no owner, and therefore nobody's personal data.
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_personas (slug, name, system_prompt) VALUES ($1, 'Platform', 'You are Platform.') RETURNING id`,
		"exp-platform-"+suffix).Scan(&fixture.personaID))
	// A character this user wrote.
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, owner_user_id, personality, scenario, first_message, tags)
		VALUES ($1, 'Mine', 'You are Mine.', $2, 'warm', 'a kitchen', 'Hey.', ARRAY['original'])
		RETURNING id`,
		"exp-mine-"+suffix, fixture.userID).Scan(&fixture.ownedPersonaID))

	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id, title, settings_user_name)
		 VALUES ($1, $2, 'A chat', 'Nick') RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&fixture.conversationID))

	for _, turn := range []struct{ role, content string }{
		{"user", "I lost my passport in Barcelona."},
		{"assistant", "That sounds stressful."},
	} {
		var id int
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO bot_messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id`,
			fixture.conversationID, turn.role, turn.content).Scan(&id))
		fixture.messageIDs = append(fixture.messageIDs, id)
	}

	return fixture
}

// encodeExport round-trips through JSON the way the worker does, so the test
// asserts on what a user would actually receive rather than on Go structs.
func encodeExport(t *testing.T, data interface{}) map[string]interface{} {
	t.Helper()
	raw, err := json.Marshal(data)
	require.NoError(t, err)
	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &decoded))
	return decoded
}

func TestExportOmniChatConversationsData(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "conv")
	ctx := context.Background()

	data, err := exportOmniChatConversationsData(ctx, pool, fixture.userID, false)
	require.NoError(t, err)
	out := encodeExport(t, data)

	require.Equal(t, float64(1), out["total"])
	require.Equal(t, float64(2), out["total_messages"])

	conversations := out["conversations"].([]interface{})
	require.Len(t, conversations, 1)
	conversation := conversations[0].(map[string]interface{})
	require.Equal(t, "A chat", conversation["title"])
	require.Equal(t, "Nick", conversation["user_name"])

	messages := conversation["messages"].([]interface{})
	require.Len(t, messages, 2)
	first := messages[0].(map[string]interface{})
	require.Equal(t, "user", first["role"])
	require.Equal(t, "I lost my passport in Barcelona.", first["content"])
}

// bot_messages has no user_id of its own, so ownership is only enforced by the
// join through bot_conversations. If that join were dropped the export would
// hand one user another user's chat history.
func TestExportOmniChatConversationsIsScopedToOwner(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "convscope")
	ctx := context.Background()

	data, err := exportOmniChatConversationsData(ctx, pool, fixture.otherUserID, false)
	require.NoError(t, err)
	out := encodeExport(t, data)

	require.Equal(t, float64(0), out["total"])
	require.Equal(t, float64(0), out["total_messages"])
	require.Empty(t, out["conversations"])
}

func TestExportOmniChatConversationsHonoursIncludeDeleted(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "convarchived")
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`UPDATE bot_conversations SET archived_at = NOW() WHERE id = $1`, fixture.conversationID)
	require.NoError(t, err)

	data, err := exportOmniChatConversationsData(ctx, pool, fixture.userID, false)
	require.NoError(t, err)
	require.Equal(t, float64(0), encodeExport(t, data)["total"])

	data, err = exportOmniChatConversationsData(ctx, pool, fixture.userID, true)
	require.NoError(t, err)
	require.Equal(t, float64(1), encodeExport(t, data)["total"])
}

// Only characters the user authored are their data. Platform personas have a
// NULL owner and belong to nobody.
func TestExportOmniChatPersonasExcludesPlatformCharacters(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "personas")
	ctx := context.Background()

	data, err := exportOmniChatPersonasData(ctx, pool, fixture.userID)
	require.NoError(t, err)
	out := encodeExport(t, data)

	require.Equal(t, float64(1), out["total"])
	personas := out["personas"].([]interface{})
	persona := personas[0].(map[string]interface{})
	require.Equal(t, "Mine", persona["name"])

	// The card fields are what make the export portable: a user should be able
	// to take a character they wrote somewhere else.
	require.Equal(t, "You are Mine.", persona["system_prompt"])
	require.Equal(t, "warm", persona["personality"])
	require.Equal(t, "a kitchen", persona["scenario"])
	require.Equal(t, "Hey.", persona["first_message"])
	require.Equal(t, []interface{}{"original"}, persona["tags"])
}

// The memory section is the one a subject-access request is really aimed at:
// these rows are the system's inferences about a person, not something they
// wrote, so the export has to carry enough provenance to contest them.
func TestExportOmniChatMemoryCarriesProvenance(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "memory")
	ctx := context.Background()

	var episodeID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO omnichat_memory_episodes
			(persona_id, owner_user_id, conversation_id, source_message_id,
			 title, summary, salience, distinctiveness, emotional_valence)
		VALUES ($1, $2, $3, $4, 'Lost passport in Barcelona',
		        'He had to visit the consulate on day two.', 0.82, 0.74, -0.4)
		RETURNING id`,
		fixture.personaID, fixture.userID, fixture.conversationID, fixture.messageIDs[0],
	).Scan(&episodeID))

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_memory_entities (persona_id, owner_user_id, canonical_name, kind, aliases, mention_count)
		VALUES ($1, $2, 'Barcelona', 'place', ARRAY['BCN'], 3)`,
		fixture.personaID, fixture.userID)
	require.NoError(t, err)

	data, err := exportOmniChatMemoryData(ctx, pool, fixture.userID)
	require.NoError(t, err)
	out := encodeExport(t, data)

	require.Equal(t, float64(1), out["total"])
	episode := out["episodes"].([]interface{})[0].(map[string]interface{})

	require.Equal(t, "Lost passport in Barcelona", episode["title"])
	require.Equal(t, "He had to visit the consulate on day two.", episode["summary"])
	require.Equal(t, "active", episode["status"])
	require.NotNil(t, episode["recorded_at"])

	// Provenance: which conversation and which turn produced the claim.
	require.Equal(t, float64(fixture.conversationID), episode["conversation_id"])
	require.Equal(t, float64(fixture.messageIDs[0]), episode["source_message_id"])

	// The scores decide when a memory resurfaces, so they are part of the
	// record rather than internal tuning detail.
	require.InDelta(t, 0.82, episode["salience"], 0.001)
	require.InDelta(t, 0.74, episode["distinctiveness"], 0.001)
	require.InDelta(t, -0.4, episode["emotional_valence"], 0.001)

	entity := out["entities"].([]interface{})[0].(map[string]interface{})
	require.Equal(t, "Barcelona", entity["name"])
	require.Equal(t, "place", entity["kind"])
	require.Equal(t, []interface{}{"BCN"}, entity["aliases"])
	require.Equal(t, float64(3), entity["mention_count"])
}

// Persona-global memory has a NULL owner and belongs to no user. It must not
// appear in anyone's export.
func TestExportOmniChatMemoryExcludesSelfTier(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "memoryselftier")
	ctx := context.Background()

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, title, summary)
		VALUES ($1, NULL, 'Something the character learned', 'Not about any user.')`,
		fixture.personaID)
	require.NoError(t, err)

	data, err := exportOmniChatMemoryData(ctx, pool, fixture.userID)
	require.NoError(t, err)
	require.Equal(t, float64(0), encodeExport(t, data)["total"])
}

func TestExportOmniChatMemoryIsScopedToOwner(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "memoryscope")
	ctx := context.Background()

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, title, summary)
		VALUES ($1, $2, 'Their private thing', 'Told in confidence.')`,
		fixture.personaID, fixture.userID)
	require.NoError(t, err)

	data, err := exportOmniChatMemoryData(ctx, pool, fixture.otherUserID)
	require.NoError(t, err)
	require.Equal(t, float64(0), encodeExport(t, data)["total"],
		"one user's export must never contain another user's memories")
}

func TestExportOmniChatMediaData(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "media")
	ctx := context.Background()

	// A media asset is anchored to a real generation job and a real stored file,
	// so the fixture has to build both rather than insert the asset alone.
	var mediaFileID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO media_files (user_id, filename, file_type, file_size, storage_url)
		VALUES ($1, 'portrait.png', 'image/png', 1234, 'omnichat/generated/portrait.png')
		RETURNING id`, fixture.userID).Scan(&mediaFileID))

	var jobID string
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO omnichat_generation_jobs
			(id, owner_user_id, persona_id, kind, mode, prompt, effective_prompt, aspect_ratio, billing_required)
		VALUES (gen_random_uuid(), $1, $2, 'image', 'create', 'a portrait', 'a portrait', '1:1', false)
		RETURNING id`, fixture.userID, fixture.personaID).Scan(&jobID))

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_media_assets
			(id, owner_user_id, persona_id, conversation_id, generation_job_id, media_file_id,
			 kind, visibility, prompt, width, height, safety_status)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'image', 'private', 'a portrait', 1024, 1024, 'approved')`,
		fixture.userID, fixture.personaID, fixture.conversationID, jobID, mediaFileID)
	require.NoError(t, err)

	data, err := exportOmniChatMediaData(ctx, pool, fixture.userID, false)
	require.NoError(t, err)
	out := encodeExport(t, data)

	require.Equal(t, float64(1), out["total"])
	asset := out["assets"].([]interface{})[0].(map[string]interface{})
	require.Equal(t, "image", asset["kind"])
	require.Equal(t, "a portrait", asset["prompt"])
	require.Equal(t, float64(1024), asset["width"])

	// Storage keys are internal addressing, not user data, and a URL embedded
	// in a downloaded archive would outlive the export's own expiry.
	require.NotContains(t, asset, "media_file_id")
	require.NotContains(t, asset, "storage_path")

	data, err = exportOmniChatMediaData(ctx, pool, fixture.otherUserID, false)
	require.NoError(t, err)
	require.Equal(t, float64(0), encodeExport(t, data)["total"])
}

// Every exporter must return an empty structure rather than an error for a user
// who has never touched OmniChat, or their whole export would be marked failed.
func TestExportOmniChatSectionsAreEmptyForUnusedAccount(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "empty")
	ctx := context.Background()

	sections := map[string]func() (interface{}, error){
		"conversations": func() (interface{}, error) {
			return exportOmniChatConversationsData(ctx, pool, fixture.otherUserID, false)
		},
		"personas": func() (interface{}, error) {
			return exportOmniChatPersonasData(ctx, pool, fixture.otherUserID)
		},
		"memory": func() (interface{}, error) {
			return exportOmniChatMemoryData(ctx, pool, fixture.otherUserID)
		},
		"media": func() (interface{}, error) {
			return exportOmniChatMediaData(ctx, pool, fixture.otherUserID, false)
		},
	}

	for name, section := range sections {
		t.Run(name, func(t *testing.T) {
			data, err := section()
			require.NoError(t, err)
			require.Equal(t, float64(0), encodeExport(t, data)["total"])
		})
	}
}

// The single-query rewrite groups rows in Go, so the grouping itself needs
// covering: several conversations must not bleed into each other, and a
// conversation with no turns must survive the LEFT JOIN rather than vanish.
func TestExportOmniChatConversationsGroupsMessagesPerConversation(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "grouping")
	ctx := context.Background()

	// A second conversation with its own turns.
	var secondID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id, title) VALUES ($1, $2, 'Second') RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&secondID))
	for _, content := range []string{"Second one", "Second two", "Second three"} {
		_, err := pool.Exec(ctx,
			`INSERT INTO bot_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
			secondID, content)
		require.NoError(t, err)
	}

	// A third with none at all.
	var emptyID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id, title) VALUES ($1, $2, 'Empty') RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&emptyID))

	data, err := exportOmniChatConversationsData(ctx, pool, fixture.userID, false)
	require.NoError(t, err)
	out := encodeExport(t, data)

	require.Equal(t, float64(3), out["total"])
	require.Equal(t, float64(5), out["total_messages"], "2 from the first, 3 from the second")
	require.Equal(t, false, out["truncated"])

	byTitle := map[string][]interface{}{}
	for _, raw := range out["conversations"].([]interface{}) {
		conversation := raw.(map[string]interface{})
		title, _ := conversation["title"].(string)
		byTitle[title] = conversation["messages"].([]interface{})
	}

	require.Len(t, byTitle["A chat"], 2)
	require.Len(t, byTitle["Second"], 3)
	require.NotNil(t, byTitle["Empty"], "an empty conversation must still be exported")
	require.Empty(t, byTitle["Empty"], "with an empty message list rather than a null")

	// Messages must land under their own conversation, not the first one.
	first := byTitle["Second"][0].(map[string]interface{})
	require.Equal(t, "Second one", first["content"])
}

// The truncation flag was first derived by adding the conversation count to the
// message count, which overstates the rows the join actually returns and would
// mark a complete export as partial. It counts scanned rows now, so an export
// well inside both caps must report itself complete.
func TestExportOmniChatConversationsReportsCompleteWhenWithinCaps(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "truncflag")
	ctx := context.Background()

	// Several conversations, each with several messages: the shape that made the
	// old arithmetic drift furthest from the real row count.
	for c := 0; c < 5; c++ {
		var id int
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO bot_conversations (user_id, persona_id, title) VALUES ($1, $2, $3) RETURNING id`,
			fixture.userID, fixture.personaID, fmt.Sprintf("Chat %d", c)).Scan(&id))
		for m := 0; m < 4; m++ {
			_, err := pool.Exec(ctx,
				`INSERT INTO bot_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
				id, fmt.Sprintf("message %d", m))
			require.NoError(t, err)
		}
	}

	data, err := exportOmniChatConversationsData(ctx, pool, fixture.userID, false)
	require.NoError(t, err)
	out := encodeExport(t, data)

	require.Equal(t, float64(6), out["total"], "5 new plus the seeded one")
	require.Equal(t, float64(22), out["total_messages"], "20 new plus the seeded 2")
	require.Equal(t, false, out["truncated"])
}

// A free character keeps what she is told as her own memory, not as part of one
// relationship. It is still derived from what this user said, so their data
// download has to show it -- marked as hers, because deleting the account will
// not remove it and she may repeat it to someone else.
func TestExportOmniChatMemoryIncludesSharedMemoriesFromOwnConversations(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "memoryshared")
	ctx := context.Background()

	var freePersonaID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, response_style_profile)
		VALUES ($1, 'Free', 'You are Free.', 'direct_message') RETURNING id`,
		"exp-free-memoryshared").Scan(&freePersonaID))

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, freePersonaID).Scan(&conversationID))

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, conversation_id, title, summary)
		VALUES ($1, NULL, $2, 'He lost his passport', 'He told me he lost it in Barcelona.')`,
		freePersonaID, conversationID)
	require.NoError(t, err)

	encoded := encodeExport(t, mustExportMemory(t, ctx, pool, fixture.userID))
	require.Equal(t, float64(1), encoded["total"])

	episodes := encoded["episodes"].([]interface{})
	episode := episodes[0].(map[string]interface{})
	require.Equal(t, "He lost his passport", episode["title"])
	require.Equal(t, true, episode["shared_with_others"],
		"the download must say plainly that this one is hers and will not be deleted")
}

// The join is on conversation ownership, so a shared memory formed with someone
// else stays out. Exporting by persona instead would hand every user everything
// the character had ever been told.
func TestExportOmniChatMemoryExcludesSharedMemoriesFromOtherPeople(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	fixture := seedOmniChatExport(t, pool, "memorysharedother")
	ctx := context.Background()

	var freePersonaID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, response_style_profile)
		VALUES ($1, 'Free', 'You are Free.', 'direct_message') RETURNING id`,
		"exp-free-memorysharedother").Scan(&freePersonaID))

	var otherConversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.otherUserID, freePersonaID).Scan(&otherConversationID))

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, conversation_id, title, summary)
		VALUES ($1, NULL, $2, 'Someone else confided', 'Not this user to tell.')`,
		freePersonaID, otherConversationID)
	require.NoError(t, err)

	encoded := encodeExport(t, mustExportMemory(t, ctx, pool, fixture.userID))
	require.Equal(t, float64(0), encoded["total"],
		"a shared memory is still not a licence to read what other people said")
}

func mustExportMemory(t *testing.T, ctx context.Context, pool *pgxpool.Pool, userID int) interface{} {
	t.Helper()
	data, err := exportOmniChatMemoryData(ctx, pool, userID)
	require.NoError(t, err)
	return data
}
