package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var reactionsTestCounter int64

func uniqueReactionsUsername(base string) string {
	id := atomic.AddInt64(&reactionsTestCounter, 1)
	return fmt.Sprintf("%s_reactions_%d_%d", base, time.Now().UnixNano(), id)
}

// reactionsTestBed holds all the state needed for a single reactions handler test.
type reactionsTestBed struct {
	handler *ReactionsHandler
	db      *database.Database
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

func TestAddReaction_InvalidEmoji(t *testing.T) {
	tests := []struct {
		name  string
		emoji string
	}{
		{"empty", ""},
		{"ascii only", "hello"},
		{"rlo override", "\u202e"},
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

	// Distinct emoji list (11 total; first 10 should succeed, 11th should 409)
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

// addTestReaction is a helper that inserts a reaction and returns its ID.
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
	addTestReaction(t, bed, bed.user2ID, "👍")
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
