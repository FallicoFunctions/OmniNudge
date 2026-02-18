package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var reactionsTestCounter int64

func uniqueReactionsUsername(base string) string {
	id := atomic.AddInt64(&reactionsTestCounter, 1)
	return fmt.Sprintf("%s_rxn_%d", base, id)
}

// reactionsTestBed holds all the state needed for a single reactions handler test.
type reactionsTestBed struct {
	handler *ReactionsHandler
	db      *database.Database
	hub     *mockHub // captures WebSocket broadcasts for assertion
	user1ID int
	user2ID int
	convID  int
	msgID   int // a seeded message from user1 → user2
}

func setupReactionsHandlerTest(t *testing.T) (*reactionsTestBed, func()) {
	t.Helper()

	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	user1 := &models.User{Username: uniqueReactionsUsername("u1"), PasswordHash: "h"}
	user2 := &models.User{Username: uniqueReactionsUsername("u2"), PasswordHash: "h"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, user2))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	messageRepo := models.NewMessageRepository(db.Pool)
	msg := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user1.ID,
		RecipientID:       user2.ID,
		EncryptedContent:  "hello",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, msg))

	hub := &mockHub{}
	reactionRepo := models.NewMessageReactionRepository(db.Pool)
	svc := services.NewReactionService(db.Pool, reactionRepo, messageRepo, nil, hub)
	handler := NewReactionsHandler(svc)

	bed := &reactionsTestBed{
		handler: handler,
		db:      db,
		hub:     hub,
		user1ID: user1.ID,
		user2ID: user2.ID,
		convID:  conv.ID,
		msgID:   msg.ID,
	}
	return bed, func() { db.Close() }
}

// ---------------------------------------------------------------------------
// AddReaction tests
// ---------------------------------------------------------------------------

func TestAddReaction_Success(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	body, _ := json.Marshal(map[string]string{"emoji": "👍"})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "👍", resp["emoji"])
	assert.Equal(t, float64(bed.user1ID), resp["user_id"])
	assert.Equal(t, float64(bed.msgID), resp["message_id"])
}

// TestAddReaction_SelfReaction verifies that a user can react to their own
// message (valid use case). Notifications are suppressed for self-reactions
// at the service layer, but the reaction itself must succeed.
func TestAddReaction_SelfReaction(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	// bed.msgID was sent by user1; user1 now reacts to their own message.
	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	body, _ := json.Marshal(map[string]string{"emoji": "😂"})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "self-reaction should succeed: %s", w.Body.String())

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "😂", resp["emoji"])
}

// TestAddReaction_SameEmojiDifferentUsers verifies that two different users can
// add the same emoji to the same message (the UNIQUE constraint is per user).
func TestAddReaction_SameEmojiDifferentUsers(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	target := fmt.Sprintf("/messages/%d/reactions", bed.msgID)
	body, _ := json.Marshal(map[string]string{"emoji": "👍"})

	// user1 reacts with 👍
	r1 := gin.New()
	r1.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})
	req1 := httptest.NewRequest(http.MethodPost, target, bytes.NewBuffer(body))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	r1.ServeHTTP(w1, req1)
	require.Equal(t, http.StatusCreated, w1.Code, w1.Body.String())

	// user2 reacts with the same 👍 — must succeed (different user)
	r2 := gin.New()
	r2.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user2ID)
		bed.handler.AddReaction(c)
	})
	req2 := httptest.NewRequest(http.MethodPost, target, bytes.NewBuffer(body))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r2.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusCreated, w2.Code, w2.Body.String())

	// GetReactions should show 1 emoji type with count=2
	rGet := gin.New()
	rGet.GET("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.GetReactions(c)
	})
	reqGet := httptest.NewRequest(http.MethodGet, target, nil)
	wGet := httptest.NewRecorder()
	rGet.ServeHTTP(wGet, reqGet)
	require.Equal(t, http.StatusOK, wGet.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(wGet.Body.Bytes(), &resp))
	assert.Equal(t, float64(1), resp["total_unique_emoji"], "only 1 unique emoji")

	reactions := resp["reactions"].([]interface{})
	require.Len(t, reactions, 1)
	first := reactions[0].(map[string]interface{})
	assert.Equal(t, "👍", first["emoji"])
	assert.Equal(t, float64(2), first["count"])
	assert.Equal(t, true, first["user_reacted"]) // user1 queried
}

func TestAddReaction_InvalidEmoji(t *testing.T) {
	tests := []struct {
		name  string
		emoji string
	}{
		{"empty", ""},
		{"ascii only", "hello"},
		{"rlo override", "\u202e"},
		{"tag character", "\U000e0041"}, // U+E0041 (tag Latin A)
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bed, cleanup := setupReactionsHandlerTest(t)
			defer cleanup()

			router := gin.New()
			router.POST("/messages/:id/reactions", func(c *gin.Context) {
				c.Set("user_id", bed.user1ID)
				bed.handler.AddReaction(c)
			})

			body, _ := json.Marshal(map[string]string{"emoji": tt.emoji})
			req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

func TestAddReaction_MissingEmoji(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	// Body with no "emoji" field — binding should reject it
	body, _ := json.Marshal(map[string]string{"other": "value"})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAddReaction_MessageNotFound(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	body, _ := json.Marshal(map[string]string{"emoji": "👍"})
	req := httptest.NewRequest(http.MethodPost, "/messages/999999/reactions", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestAddReaction_NotParticipant(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	// Create a third user outside this conversation
	ctx := context.Background()
	userRepo := models.NewUserRepository(bed.db.Pool)
	outsider := &models.User{Username: uniqueReactionsUsername("outsider"), PasswordHash: "h"}
	require.NoError(t, userRepo.Create(ctx, outsider))

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		bed.handler.AddReaction(c)
	})

	body, _ := json.Marshal(map[string]string{"emoji": "👍"})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAddReaction_AlreadyReacted(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	body, _ := json.Marshal(map[string]string{"emoji": "👍"})
	target := fmt.Sprintf("/messages/%d/reactions", bed.msgID)

	// First reaction — succeeds
	req1 := httptest.NewRequest(http.MethodPost, target, bytes.NewBuffer(body))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	require.Equal(t, http.StatusCreated, w1.Code, w1.Body.String())

	// Second identical reaction — conflict
	req2 := httptest.NewRequest(http.MethodPost, target, bytes.NewBuffer(body))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusConflict, w2.Code)
}

func TestAddReaction_TooManyEmoji(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	target := fmt.Sprintf("/messages/%d/reactions", bed.msgID)

	// 11 distinct emoji — first 10 succeed, 11th must return 409
	emojis := []string{"👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥", "💯", "✅", "🚀"}
	require.Len(t, emojis, 11)

	for i, emoji := range emojis {
		body, _ := json.Marshal(map[string]string{"emoji": emoji})
		req := httptest.NewRequest(http.MethodPost, target, bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if i < 10 {
			assert.Equal(t, http.StatusCreated, w.Code, "emoji %d (%s): %s", i, emoji, w.Body.String())
		} else {
			assert.Equal(t, http.StatusConflict, w.Code, "11th emoji should be rejected: %s", w.Body.String())
		}
	}
}

func TestAddReaction_RateLimited(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST(
		"/messages/:id/reactions",
		func(c *gin.Context) {
			c.Set("user_id", bed.user1ID)
			c.Next()
		},
		middleware.ReactionRateLimiter().Middleware(),
		bed.handler.AddReaction,
	)

	target := fmt.Sprintf("/messages/%d/reactions", bed.msgID)
	var statusCodes []int
	for i := 0; i < 11; i++ {
		body, _ := json.Marshal(map[string]string{"emoji": "👍"})
		req := httptest.NewRequest(http.MethodPost, target, bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		statusCodes = append(statusCodes, w.Code)
	}

	assert.Equal(t, http.StatusTooManyRequests, statusCodes[len(statusCodes)-1], "11th request should be rate limited")
}

// TestMessageReactions_DBConstraint_MaxUniqueEmoji ensures the database-level
// trigger enforces the 10-unique-emoji cap even when inserts bypass service logic.
func TestMessageReactions_DBConstraint_MaxUniqueEmoji(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	emojis := []string{"👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥", "💯", "✅", "🚀"}
	require.Len(t, emojis, 11)

	for i, emoji := range emojis {
		_, err := bed.db.Pool.Exec(context.Background(), `
			INSERT INTO message_reactions (message_id, user_id, emoji)
			VALUES ($1, $2, $3)
		`, bed.msgID, bed.user1ID, emoji)

		if i < 10 {
			require.NoError(t, err, "emoji %d (%s) should insert", i, emoji)
			continue
		}

		require.Error(t, err, "11th unique emoji insert should fail")
		var pgErr *pgconn.PgError
		require.ErrorAs(t, err, &pgErr)
		assert.Equal(t, "23514", pgErr.Code)
		assert.Equal(t, "message_reactions_max_unique_emoji_per_message", pgErr.ConstraintName)
	}

	var distinctCount int
	err := bed.db.Pool.QueryRow(context.Background(), `
		SELECT COUNT(DISTINCT emoji)
		FROM message_reactions
		WHERE message_id = $1
	`, bed.msgID).Scan(&distinctCount)
	require.NoError(t, err)
	assert.Equal(t, 10, distinctCount)
}

// TestMessageReactions_DBConstraint_MaxUniqueEmoji_ConcurrentBypass ensures the
// DB-level cap remains enforced under concurrent direct inserts.
func TestMessageReactions_DBConstraint_MaxUniqueEmoji_ConcurrentBypass(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	emojis := []string{"👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥", "💯", "✅", "🚀", "🧠", "🌟", "🐳", "🍕"}
	const workers = 5

	var successCount int64
	var wg sync.WaitGroup

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			actorID := bed.user1ID
			if worker%2 == 1 {
				actorID = bed.user2ID
			}
			for i, emoji := range emojis {
				_, err := bed.db.Pool.Exec(context.Background(), `
					INSERT INTO message_reactions (message_id, user_id, emoji)
					VALUES ($1, $2, $3)
					ON CONFLICT (message_id, user_id, emoji) DO NOTHING
				`, bed.msgID, actorID, fmt.Sprintf("%s_%d_%d", emoji, worker, i))

				if err == nil {
					atomic.AddInt64(&successCount, 1)
					continue
				}

				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.ConstraintName == "message_reactions_max_unique_emoji_per_message" {
					continue
				}

				// Duplicate-key conflicts from concurrent inserts are acceptable;
				// this path is mostly for cap-enforcement validation.
				t.Errorf("unexpected insert error: %v", err)
			}
		}(w)
	}
	wg.Wait()

	var distinctCount int
	err := bed.db.Pool.QueryRow(context.Background(), `
		SELECT COUNT(DISTINCT emoji)
		FROM message_reactions
		WHERE message_id = $1
	`, bed.msgID).Scan(&distinctCount)
	require.NoError(t, err)

	assert.LessOrEqual(t, distinctCount, 10, "DB cap should hold under concurrency")
	assert.Equal(t, 10, distinctCount, "table should end at the configured max")
	assert.GreaterOrEqual(t, successCount, int64(10), "at least 10 inserts should succeed")
}

func TestAddReaction_Unauthenticated(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", bed.handler.AddReaction) // no user_id set

	body, _ := json.Marshal(map[string]string{"emoji": "👍"})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAddReaction_InvalidMessageID(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	body, _ := json.Marshal(map[string]string{"emoji": "👍"})
	req := httptest.NewRequest(http.MethodPost, "/messages/notanumber/reactions", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ---------------------------------------------------------------------------
// RemoveReaction tests
// ---------------------------------------------------------------------------

// addTestReaction bypasses the service layer to insert a reaction directly,
// avoiding any rate-limit or business-logic interference in test setup.
func addTestReaction(t *testing.T, bed *reactionsTestBed, userID int, emoji string) int {
	t.Helper()
	ctx := context.Background()
	var id int
	err := bed.db.Pool.QueryRow(ctx, `
		INSERT INTO message_reactions (message_id, user_id, emoji)
		VALUES ($1, $2, $3)
		RETURNING id
	`, bed.msgID, userID, emoji).Scan(&id)
	require.NoError(t, err)
	return id
}

func TestRemoveReaction_Success(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	reactionID := addTestReaction(t, bed, bed.user1ID, "👍")

	router := gin.New()
	router.DELETE("/messages/:id/reactions/:reaction_id", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.RemoveReaction(c)
	})

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/messages/%d/reactions/%d", bed.msgID, reactionID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())

	// Confirm row is gone
	var exists bool
	err := bed.db.Pool.QueryRow(context.Background(),
		"SELECT EXISTS(SELECT 1 FROM message_reactions WHERE id = $1)", reactionID,
	).Scan(&exists)
	require.NoError(t, err)
	assert.False(t, exists)
}

func TestRemoveReaction_NotOwner(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	// user1 owns the reaction; user2 tries to remove it
	reactionID := addTestReaction(t, bed, bed.user1ID, "❤️")

	router := gin.New()
	router.DELETE("/messages/:id/reactions/:reaction_id", func(c *gin.Context) {
		c.Set("user_id", bed.user2ID)
		bed.handler.RemoveReaction(c)
	})

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/messages/%d/reactions/%d", bed.msgID, reactionID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestRemoveReaction_NotFound(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.DELETE("/messages/:id/reactions/:reaction_id", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.RemoveReaction(c)
	})

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/messages/%d/reactions/999999", bed.msgID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// TestRemoveReaction_WrongMessage verifies that a reaction cannot be deleted by
// providing the correct reaction_id but the wrong message_id in the URL path.
// This prevents information leakage: an attacker cannot probe whether a
// reaction_id exists on a different message.
func TestRemoveReaction_WrongMessage(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	reactionID := addTestReaction(t, bed, bed.user1ID, "👍")

	router := gin.New()
	router.DELETE("/messages/:id/reactions/:reaction_id", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.RemoveReaction(c)
	})

	// Use a non-existent message ID (999999) with a real reaction ID
	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/messages/999999/reactions/%d", reactionID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code,
		"reaction belongs to a different message, should be 404")
}

func TestRemoveReaction_Unauthenticated(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	reactionID := addTestReaction(t, bed, bed.user1ID, "👍")

	router := gin.New()
	router.DELETE("/messages/:id/reactions/:reaction_id", bed.handler.RemoveReaction)

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/messages/%d/reactions/%d", bed.msgID, reactionID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// ---------------------------------------------------------------------------
// GetReactions tests
// ---------------------------------------------------------------------------

func TestGetReactions_Empty(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.GET("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.GetReactions(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/messages/%d/reactions", bed.msgID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(0), resp["total_unique_emoji"])
	assert.IsType(t, []interface{}{}, resp["reactions"])
	assert.Equal(t, false, resp["users_truncated"])
}

func TestGetReactions_WithReactions(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	// user1 and user2 both add thumbs-up; user2 also adds heart
	addTestReaction(t, bed, bed.user1ID, "👍")
	// Small sleep to ensure created_at ordering is deterministic
	time.Sleep(2 * time.Millisecond)
	addTestReaction(t, bed, bed.user2ID, "👍")
	time.Sleep(2 * time.Millisecond)
	addTestReaction(t, bed, bed.user2ID, "❤️")

	router := gin.New()
	router.GET("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.GetReactions(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/messages/%d/reactions", bed.msgID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(2), resp["total_unique_emoji"])

	reactions := resp["reactions"].([]interface{})
	require.Len(t, reactions, 2)

	// First entry should be 👍 (count 2, most popular)
	first := reactions[0].(map[string]interface{})
	assert.Equal(t, "👍", first["emoji"])
	assert.Equal(t, float64(2), first["count"])
	assert.Equal(t, true, first["user_reacted"]) // user1 reacted with 👍

	// Second entry should be ❤️ (count 1)
	second := reactions[1].(map[string]interface{})
	assert.Equal(t, "❤️", second["emoji"])
	assert.Equal(t, float64(1), second["count"])
	assert.Equal(t, false, second["user_reacted"]) // user1 did NOT react with ❤️
}

func TestGetReactions_NotParticipant(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(bed.db.Pool)
	outsider := &models.User{Username: uniqueReactionsUsername("outsider"), PasswordHash: "h"}
	require.NoError(t, userRepo.Create(ctx, outsider))

	router := gin.New()
	router.GET("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		bed.handler.GetReactions(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/messages/%d/reactions", bed.msgID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetReactions_MessageNotFound(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.GET("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.GetReactions(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/messages/999999/reactions", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetReactions_Unauthenticated(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.GET("/messages/:id/reactions", bed.handler.GetReactions)

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/messages/%d/reactions", bed.msgID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// ---------------------------------------------------------------------------
// E5 — invalid reaction_id parameter
// ---------------------------------------------------------------------------

// TestRemoveReaction_InvalidReactionID verifies that a non-numeric reaction_id
// path parameter returns 400 before the handler touches the database.
func TestRemoveReaction_InvalidReactionID(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.DELETE("/messages/:id/reactions/:reaction_id", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.RemoveReaction(c)
	})

	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/messages/%d/reactions/notanumber", bed.msgID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ---------------------------------------------------------------------------
// E6 — oversized emoji
// ---------------------------------------------------------------------------

// TestAddReaction_OversizedEmoji verifies that an emoji string exceeding the
// 100-byte limit is rejected with 400 by the service-layer isValidEmoji check.
func TestAddReaction_OversizedEmoji(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	// 26 × 👍 = 104 UTF-8 bytes, exceeds the 100-byte limit.
	oversized := ""
	for i := 0; i < 26; i++ {
		oversized += "👍"
	}
	body, _ := json.Marshal(map[string]string{"emoji": oversized})
	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ---------------------------------------------------------------------------
// E7 — WebSocket broadcast verification
// ---------------------------------------------------------------------------

// TestAddReaction_BroadcastsToOtherParticipant verifies that a successful
// AddReaction triggers a "reaction_added" WebSocket broadcast to the other
// conversation participant (user2), and does NOT broadcast to the actor (user1).
func TestAddReaction_BroadcastsToOtherParticipant(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	body, _ := json.Marshal(map[string]string{"emoji": "🔥"})
	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	// The broadcast goroutine is non-blocking; poll for up to 500 ms.
	require.Eventually(t, func() bool {
		for _, msg := range bed.hub.SnapshotBroadcastCalls() {
			if msg.Type == "reaction_added" && msg.RecipientID == bed.user2ID {
				return true
			}
		}
		return false
	}, 500*time.Millisecond, 10*time.Millisecond,
		"expected reaction_added broadcast to user2 within 500 ms")

	var addedPayload models.ReactionEvent
	foundAddedPayload := false
	for _, msg := range bed.hub.SnapshotBroadcastCalls() {
		if msg.Type == "reaction_added" && msg.RecipientID == bed.user2ID {
			event, ok := msg.Payload.(models.ReactionEvent)
			require.True(t, ok, "reaction_added payload should be models.ReactionEvent")
			addedPayload = event
			foundAddedPayload = true
			break
		}
	}
	require.True(t, foundAddedPayload, "expected a reaction_added payload for recipient")
	assert.Equal(t, "reaction_added", addedPayload.Type)
	assert.Equal(t, bed.msgID, addedPayload.MessageID)
	assert.Equal(t, bed.convID, addedPayload.ConversationID)
	require.NotNil(t, addedPayload.Reaction)
	assert.Equal(t, "🔥", addedPayload.Reaction.Emoji)
	assert.Equal(t, bed.msgID, addedPayload.Reaction.MessageID)
	assert.Equal(t, bed.user1ID, addedPayload.Reaction.UserID)

	// The actor (user1) must NOT receive a broadcast — they apply an optimistic
	// update on the client side.
	for _, msg := range bed.hub.SnapshotBroadcastCalls() {
		if msg.Type == "reaction_added" && msg.RecipientID == bed.user1ID {
			t.Errorf("unexpected reaction_added broadcast to actor user1")
		}
	}
}

// ---------------------------------------------------------------------------
// M3 — RemoveReaction broadcast verification
// ---------------------------------------------------------------------------

// TestRemoveReaction_BroadcastsToOtherParticipant verifies that a successful
// RemoveReaction triggers a "reaction_removed" WebSocket broadcast to the other
// conversation participant (user2) and NOT to the actor (user1).
func TestRemoveReaction_BroadcastsToOtherParticipant(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	reactionID := addTestReaction(t, bed, bed.user1ID, "🔥")

	router := gin.New()
	router.DELETE("/messages/:id/reactions/:reaction_id", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.RemoveReaction(c)
	})

	req := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/messages/%d/reactions/%d", bed.msgID, reactionID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	// The broadcast goroutine is non-blocking; poll for up to 500 ms.
	require.Eventually(t, func() bool {
		for _, msg := range bed.hub.SnapshotBroadcastCalls() {
			if msg.Type == "reaction_removed" && msg.RecipientID == bed.user2ID {
				return true
			}
		}
		return false
	}, 500*time.Millisecond, 10*time.Millisecond,
		"expected reaction_removed broadcast to user2 within 500 ms")

	var removedPayload models.ReactionEvent
	foundRemovedPayload := false
	for _, msg := range bed.hub.SnapshotBroadcastCalls() {
		if msg.Type == "reaction_removed" && msg.RecipientID == bed.user2ID {
			event, ok := msg.Payload.(models.ReactionEvent)
			require.True(t, ok, "reaction_removed payload should be models.ReactionEvent")
			removedPayload = event
			foundRemovedPayload = true
			break
		}
	}
	require.True(t, foundRemovedPayload, "expected a reaction_removed payload for recipient")
	assert.Equal(t, "reaction_removed", removedPayload.Type)
	assert.Equal(t, bed.msgID, removedPayload.MessageID)
	assert.Equal(t, bed.convID, removedPayload.ConversationID)
	require.NotNil(t, removedPayload.ReactionID)
	assert.Equal(t, reactionID, *removedPayload.ReactionID)
	require.NotNil(t, removedPayload.UserID)
	assert.Equal(t, bed.user1ID, *removedPayload.UserID)
	require.NotNil(t, removedPayload.Emoji)
	assert.Equal(t, "🔥", *removedPayload.Emoji)

	// The actor (user1) must NOT receive the broadcast.
	for _, msg := range bed.hub.SnapshotBroadcastCalls() {
		if msg.Type == "reaction_removed" && msg.RecipientID == bed.user1ID {
			t.Errorf("unexpected reaction_removed broadcast to actor user1")
		}
	}
}

// ---------------------------------------------------------------------------
// M1 — Full reaction lifecycle test
// ---------------------------------------------------------------------------

// TestReactionLifecycle_AddGetRemoveGet validates the complete lifecycle of a
// reaction: add it, verify it appears in GetReactions, remove it, verify the
// count decrements to zero.
func TestReactionLifecycle_AddGetRemoveGet(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	target := fmt.Sprintf("/messages/%d/reactions", bed.msgID)

	// 1. Add reaction
	addRouter := gin.New()
	addRouter.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})
	body, _ := json.Marshal(map[string]string{"emoji": "🎉"})
	addReq := httptest.NewRequest(http.MethodPost, target, bytes.NewBuffer(body))
	addReq.Header.Set("Content-Type", "application/json")
	addW := httptest.NewRecorder()
	addRouter.ServeHTTP(addW, addReq)
	require.Equal(t, http.StatusCreated, addW.Code, "add: %s", addW.Body.String())

	var addResp map[string]interface{}
	require.NoError(t, json.Unmarshal(addW.Body.Bytes(), &addResp))
	reactionID := int(addResp["id"].(float64))

	// 2. GetReactions — should show 1 reaction with count=1
	getRouter := gin.New()
	getRouter.GET("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.GetReactions(c)
	})
	getReq := httptest.NewRequest(http.MethodGet, target, nil)
	getW := httptest.NewRecorder()
	getRouter.ServeHTTP(getW, getReq)
	require.Equal(t, http.StatusOK, getW.Code)

	var getResp map[string]interface{}
	require.NoError(t, json.Unmarshal(getW.Body.Bytes(), &getResp))
	assert.Equal(t, float64(1), getResp["total_unique_emoji"], "should have 1 unique emoji after add")
	rxns := getResp["reactions"].([]interface{})
	require.Len(t, rxns, 1)
	assert.Equal(t, float64(1), rxns[0].(map[string]interface{})["count"])

	// 3. Remove reaction
	delRouter := gin.New()
	delRouter.DELETE("/messages/:id/reactions/:reaction_id", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.RemoveReaction(c)
	})
	delReq := httptest.NewRequest(http.MethodDelete,
		fmt.Sprintf("/messages/%d/reactions/%d", bed.msgID, reactionID), nil)
	delW := httptest.NewRecorder()
	delRouter.ServeHTTP(delW, delReq)
	require.Equal(t, http.StatusOK, delW.Code, "remove: %s", delW.Body.String())

	// 4. GetReactions — should be empty now
	getReq2 := httptest.NewRequest(http.MethodGet, target, nil)
	getW2 := httptest.NewRecorder()
	getRouter.ServeHTTP(getW2, getReq2)
	require.Equal(t, http.StatusOK, getW2.Code)

	var getResp2 map[string]interface{}
	require.NoError(t, json.Unmarshal(getW2.Body.Bytes(), &getResp2))
	assert.Equal(t, float64(0), getResp2["total_unique_emoji"], "should have 0 unique emoji after remove")
	rxns2 := getResp2["reactions"].([]interface{})
	assert.Empty(t, rxns2, "reaction list should be empty after removal")
}

// ---------------------------------------------------------------------------
// M2 — Concurrent AddReaction cap enforcement (advisory lock verification)
// ---------------------------------------------------------------------------

// TestAddReaction_ConcurrentCapEnforcement fires 11 concurrent AddReaction
// requests for 11 distinct emoji against the same message. Exactly 10 must
// succeed (cap) and at least 1 must fail with 409. This exercises the
// pg_advisory_xact_lock path that serializes cap-check + insert.
func TestAddReaction_ConcurrentCapEnforcement(t *testing.T) {
	bed, cleanup := setupReactionsHandlerTest(t)
	defer cleanup()

	emojis := []string{"👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🔥", "💯", "✅", "🚀"}
	require.Len(t, emojis, 11)

	router := gin.New()
	router.POST("/messages/:id/reactions", func(c *gin.Context) {
		c.Set("user_id", bed.user1ID)
		bed.handler.AddReaction(c)
	})

	type result struct {
		status int
	}
	results := make([]result, len(emojis))

	var wg sync.WaitGroup
	wg.Add(len(emojis))
	for i, emoji := range emojis {
		i, emoji := i, emoji
		go func() {
			defer wg.Done()
			body, _ := json.Marshal(map[string]string{"emoji": emoji})
			req := httptest.NewRequest(http.MethodPost,
				fmt.Sprintf("/messages/%d/reactions", bed.msgID), bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			results[i] = result{status: w.Code}
		}()
	}
	wg.Wait()

	successes := 0
	conflicts := 0
	for _, r := range results {
		switch r.status {
		case http.StatusCreated:
			successes++
		case http.StatusConflict:
			conflicts++
		default:
			t.Errorf("unexpected status %d", r.status)
		}
	}

	assert.Equal(t, 10, successes, "exactly 10 emoji should be accepted (cap)")
	assert.Equal(t, 1, conflicts, "exactly 1 emoji should be rejected (cap exceeded)")
}
