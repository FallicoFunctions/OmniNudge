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

	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var conversationsTestCounter int64

func uniqueConversationsUsername(base string) string {
	id := atomic.AddInt64(&conversationsTestCounter, 1)
	return fmt.Sprintf("%s_conversations_%d_%d", base, time.Now().UnixNano(), id)
}

func setupConversationsHandlerTest(t *testing.T) (*ConversationsHandler, *database.Database, int, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Create test users
	userRepo := models.NewUserRepository(db.Pool)
	user1 := &models.User{
		Username:     uniqueConversationsUsername("user1"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user1)
	require.NoError(t, err)

	user2 := &models.User{
		Username:     uniqueConversationsUsername("user2"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user2)
	require.NoError(t, err)

	// Create handler
	convRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)
	handler := NewConversationsHandler(convRepo, messageRepo, userRepo)

	cleanup := func() {
		db.Close()
	}

	return handler, db, user1.ID, user2.ID, cleanup
}

func TestCreateConversation(t *testing.T) {
	handler, _, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.POST("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.CreateConversation(c)
	})

	body := map[string]interface{}{
		"other_user_id": user2ID,
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/conversations", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.NotNil(t, response["id"])
	// Verify both users are participants (user1_id and user2_id could be in either order)
	user1InConv := response["user1_id"] == float64(user1ID) || response["user2_id"] == float64(user1ID)
	user2InConv := response["user1_id"] == float64(user2ID) || response["user2_id"] == float64(user2ID)
	assert.True(t, user1InConv, "User1 should be in conversation")
	assert.True(t, user2InConv, "User2 should be in conversation")
}

func TestCreateConversation_DuplicatePrevention(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create conversation first time
	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	existingConv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.CreateConversation(c)
	})

	body := map[string]interface{}{
		"other_user_id": user2ID,
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/conversations", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should return existing conversation (201 status)
	assert.Equal(t, http.StatusCreated, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, float64(existingConv.ID), response["id"])
}

func TestCreateConversation_SelfConversationPrevention(t *testing.T) {
	handler, _, user1ID, _, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.POST("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.CreateConversation(c)
	})

	body := map[string]interface{}{
		"other_user_id": user1ID, // Same as authenticated user
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/conversations", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "Cannot create conversation with yourself")
}

func TestCreateConversation_UserNotFound(t *testing.T) {
	handler, _, user1ID, _, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.POST("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.CreateConversation(c)
	})

	body := map[string]interface{}{
		"other_user_id": 999999, // Non-existent user
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/conversations", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Accept either 404 or 500 depending on repository implementation
	assert.True(t, w.Code == http.StatusNotFound || w.Code == http.StatusInternalServerError)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.NotEmpty(t, response["error"])
}

func TestGetConversations(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create another user for a second conversation
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	user3 := &models.User{
		Username:     uniqueConversationsUsername("user3"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user3)
	require.NoError(t, err)

	// Create conversations
	convRepo := models.NewConversationRepository(db.Pool)
	_, err = convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)
	_, err = convRepo.Create(ctx, user1ID, user3.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversations(c)
	})

	req := httptest.NewRequest("GET", "/conversations", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	conversations := response["conversations"].([]interface{})
	assert.Equal(t, 2, len(conversations))
	assert.Equal(t, float64(20), response["limit"])
	assert.Equal(t, float64(0), response["offset"])

	// Verify enrichment with other_user
	for _, conv := range conversations {
		convMap := conv.(map[string]interface{})
		assert.NotNil(t, convMap["other_user"])
		otherUser := convMap["other_user"].(map[string]interface{})
		assert.NotNil(t, otherUser["username"])
	}
}

func TestGetConversations_WithMessages(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create conversation
	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	// Create messages
	messageRepo := models.NewMessageRepository(db.Pool)
	for i := 0; i < 3; i++ {
		msg := &models.Message{
			ConversationID:    conv.ID,
			SenderID:          user1ID,
			RecipientID:       user2ID,
			EncryptedContent:  fmt.Sprintf("message%d", i),
			MessageType:       "text",
			EncryptionVersion: "v1",
		}
		err = messageRepo.Create(ctx, msg)
		require.NoError(t, err)
	}

	router := gin.Default()
	router.GET("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversations(c)
	})

	req := httptest.NewRequest("GET", "/conversations", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	conversations := response["conversations"].([]interface{})
	assert.Equal(t, 1, len(conversations))

	// Verify enrichment with latest_message
	convMap := conversations[0].(map[string]interface{})
	assert.NotNil(t, convMap["latest_message"])
	latestMsg := convMap["latest_message"].(map[string]interface{})
	assert.Equal(t, "message2", latestMsg["encrypted_content"])

	// Verify unread_count is included
	assert.NotNil(t, convMap["unread_count"])
}

func TestGetConversations_Pagination(t *testing.T) {
	handler, db, user1ID, _, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create 5 conversations
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	convRepo := models.NewConversationRepository(db.Pool)

	for i := 0; i < 5; i++ {
		otherUser := &models.User{
			Username:     uniqueConversationsUsername(fmt.Sprintf("user%d", i)),
			PasswordHash: "test_hash",
		}
		err := userRepo.Create(ctx, otherUser)
		require.NoError(t, err)

		_, err = convRepo.Create(ctx, user1ID, otherUser.ID)
		require.NoError(t, err)
	}

	router := gin.Default()
	router.GET("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversations(c)
	})

	req := httptest.NewRequest("GET", "/conversations?limit=2&offset=1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	conversations := response["conversations"].([]interface{})
	assert.Equal(t, 2, len(conversations))
	assert.Equal(t, float64(2), response["limit"])
	assert.Equal(t, float64(1), response["offset"])
}

func TestGetConversation(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create conversation
	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversation(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, float64(conv.ID), response["id"])
	assert.NotNil(t, response["other_user"])
	assert.NotNil(t, response["unread_count"])
}

func TestGetConversation_NotParticipant(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create conversation between user1 and user2
	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	// Create a third user not in the conversation
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueConversationsUsername("outsider"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, outsider)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.GetConversation(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetConversation_NotFound(t *testing.T) {
	handler, _, user1ID, _, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/conversations/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversation(c)
	})

	req := httptest.NewRequest("GET", "/conversations/999999", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestDeleteConversation(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create conversation
	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	// Create messages
	messageRepo := models.NewMessageRepository(db.Pool)
	msg := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err = messageRepo.Create(ctx, msg)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/conversations/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.DeleteConversation(c)
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/conversations/%d", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify conversation is deleted
	deleted, err := convRepo.GetByID(ctx, conv.ID)
	require.NoError(t, err)
	assert.Nil(t, deleted)
}

func TestDeleteConversation_NotParticipant(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	// Create conversation
	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	// Create a third user not in the conversation
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueConversationsUsername("outsider"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, outsider)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/conversations/:id", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.DeleteConversation(c)
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/conversations/%d", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}
