package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

var omniChatMemoryTestCounter int64

type omniChatMemoryFixture struct {
	pool           *database.Database
	repo           *models.OmniChatMemoryRepository
	userID         int
	otherUserID    int
	personaID      int
	conversationID int
	messageID      int
	episodeID      int64
}

func setupOmniChatMemoryHandlerTest(t *testing.T) omniChatMemoryFixture {
	t.Helper()
	ctx := context.Background()

	db, err := database.NewTest()
	require.NoError(t, err)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	t.Cleanup(db.Close)

	suffix := fmt.Sprintf("%d_%d", time.Now().UnixNano(), atomic.AddInt64(&omniChatMemoryTestCounter, 1))
	fixture := omniChatMemoryFixture{pool: db, repo: models.NewOmniChatMemoryRepository(db.Pool)}

	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO users (username, username_normalized, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
		"memh_"+suffix).Scan(&fixture.userID))
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO users (username, username_normalized, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
		"memhother_"+suffix).Scan(&fixture.otherUserID))
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO bot_personas (slug, name, system_prompt) VALUES ($1, 'Memtest', 'You are Memtest.') RETURNING id`,
		"memh-persona-"+suffix).Scan(&fixture.personaID))
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&fixture.conversationID))
	require.NoError(t, db.Pool.QueryRow(ctx,
		`INSERT INTO bot_messages (conversation_id, role, content) VALUES ($1, 'user', 'I lost my passport.') RETURNING id`,
		fixture.conversationID).Scan(&fixture.messageID))
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO omnichat_memory_episodes
			(persona_id, owner_user_id, conversation_id, source_message_id, title, summary, salience, distinctiveness)
		VALUES ($1, $2, $3, $4, 'Lost passport in Barcelona', 'Consulate on day two.', 0.8, 0.7)
		RETURNING id`,
		fixture.personaID, fixture.userID, fixture.conversationID, fixture.messageID).Scan(&fixture.episodeID))

	return fixture
}

// memoryContext builds an authenticated request bound to one path parameter.
func memoryContext(method, target string, userID int, id string) (*httptest.ResponseRecorder, *gin.Context) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, target, nil)
	c.Set("user_id", userID)
	c.Params = gin.Params{{Key: "id", Value: id}}
	return w, c
}

func TestListConversationMemories_ReturnsProvenance(t *testing.T) {
	fixture := setupOmniChatMemoryHandlerTest(t)
	handler := NewOmniChatMemoryHandler(fixture.repo)

	w, c := memoryContext(http.MethodGet, "/omnichat/conversations/1/memories",
		fixture.userID, fmt.Sprint(fixture.conversationID))
	handler.ListConversationMemories(c)

	require.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Total    int `json:"total"`
		Memories []struct {
			ID              int64   `json:"id"`
			ConversationID  int     `json:"conversation_id"`
			SourceMessageID int     `json:"source_message_id"`
			Title           string  `json:"title"`
			Salience        float64 `json:"salience"`
			Status          string  `json:"status"`
		} `json:"memories"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Equal(t, 1, resp.Total)
	require.Equal(t, "Lost passport in Barcelona", resp.Memories[0].Title)

	// The point of the surface: a user can trace a claim back to the turn it
	// came from. The stored model hides these fields, so the projection has to
	// restate them.
	require.Equal(t, fixture.conversationID, resp.Memories[0].ConversationID)
	require.Equal(t, fixture.messageID, resp.Memories[0].SourceMessageID)
	require.InDelta(t, 0.8, resp.Memories[0].Salience, 0.001)
	require.Equal(t, "active", resp.Memories[0].Status)
}

// A conversation id is guessable, so an unowned one must read as empty rather
// than as somebody else's history.
func TestListConversationMemories_IsScopedToOwner(t *testing.T) {
	fixture := setupOmniChatMemoryHandlerTest(t)
	handler := NewOmniChatMemoryHandler(fixture.repo)

	w, c := memoryContext(http.MethodGet, "/omnichat/conversations/1/memories",
		fixture.otherUserID, fmt.Sprint(fixture.conversationID))
	handler.ListConversationMemories(c)

	require.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Zero(t, resp.Total)
}

func TestListConversationMemories_RejectsBadID(t *testing.T) {
	fixture := setupOmniChatMemoryHandlerTest(t)
	handler := NewOmniChatMemoryHandler(fixture.repo)

	for _, badID := range []string{"abc", "0", "-1"} {
		w, c := memoryContext(http.MethodGet, "/omnichat/conversations/x/memories", fixture.userID, badID)
		handler.ListConversationMemories(c)
		require.Equal(t, http.StatusBadRequest, w.Code, "id %q", badID)
	}
}

func TestForgetMemory_RemovesFromRecall(t *testing.T) {
	fixture := setupOmniChatMemoryHandlerTest(t)
	handler := NewOmniChatMemoryHandler(fixture.repo)
	ctx := context.Background()

	w, c := memoryContext(http.MethodDelete, "/omnichat/memories/1",
		fixture.userID, fmt.Sprint(fixture.episodeID))
	handler.ForgetMemory(c)

	require.Equal(t, http.StatusOK, w.Code)

	// Forgetting is a correction, not a deletion: the row and its provenance
	// survive so the record of what was inferred is not itself erased.
	var status string
	require.NoError(t, fixture.pool.Pool.QueryRow(ctx,
		`SELECT status FROM omnichat_memory_episodes WHERE id = $1`, fixture.episodeID).Scan(&status))
	require.Equal(t, "user_hidden", status)

	// And it stops influencing replies immediately.
	recalled, err := fixture.repo.Recall(ctx, fixture.personaID, fixture.userID,
		"tell me about the passport", models.DefaultOmniChatMemoryRecallWeights(), 6)
	require.NoError(t, err)
	require.Empty(t, recalled)
}

// Another user's memory must be indistinguishable from one that does not exist.
func TestForgetMemory_CannotForgetAnotherUsersMemory(t *testing.T) {
	fixture := setupOmniChatMemoryHandlerTest(t)
	handler := NewOmniChatMemoryHandler(fixture.repo)

	w, c := memoryContext(http.MethodDelete, "/omnichat/memories/1",
		fixture.otherUserID, fmt.Sprint(fixture.episodeID))
	handler.ForgetMemory(c)

	require.Equal(t, http.StatusNotFound, w.Code)

	var status string
	require.NoError(t, fixture.pool.Pool.QueryRow(context.Background(),
		`SELECT status FROM omnichat_memory_episodes WHERE id = $1`, fixture.episodeID).Scan(&status))
	require.Equal(t, "active", status, "the owner's memory must be untouched")
}

func TestForgetMemory_MissingMemoryIsNotFound(t *testing.T) {
	fixture := setupOmniChatMemoryHandlerTest(t)
	handler := NewOmniChatMemoryHandler(fixture.repo)

	w, c := memoryContext(http.MethodDelete, "/omnichat/memories/999999", fixture.userID, "999999")
	handler.ForgetMemory(c)

	require.Equal(t, http.StatusNotFound, w.Code)
}

func TestOmniChatMemoryHandler_FailsClosedWithoutRepository(t *testing.T) {
	handler := NewOmniChatMemoryHandler(nil)

	w, c := memoryContext(http.MethodGet, "/omnichat/conversations/1/memories", 1, "1")
	handler.ListConversationMemories(c)
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
}
