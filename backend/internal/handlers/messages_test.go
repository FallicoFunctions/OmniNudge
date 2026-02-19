package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var messagesTestCounter int64

func uniqueMessagesUsername(base string) string {
	id := atomic.AddInt64(&messagesTestCounter, 1)
	return fmt.Sprintf("%s_messages_%d_%d", base, time.Now().UnixNano(), id)
}

type mockHub struct {
	mu             sync.Mutex
	broadcastCalls []*websocket.Message
	onlineUsers    map[int]bool
}

func (m *mockHub) Broadcast(msg *websocket.Message) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.broadcastCalls = append(m.broadcastCalls, msg)
}

func (m *mockHub) SnapshotBroadcastCalls() []*websocket.Message {
	m.mu.Lock()
	defer m.mu.Unlock()
	calls := make([]*websocket.Message, len(m.broadcastCalls))
	copy(calls, m.broadcastCalls)
	return calls
}

func (m *mockHub) IsUserOnline(userID int) bool {
	if m.onlineUsers == nil {
		return false
	}
	return m.onlineUsers[userID]
}

func setupMessagesHandlerTest(t *testing.T) (*MessagesHandler, *database.Database, int, int, int, *mockHub, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	// Create test users
	userRepo := models.NewUserRepository(db.Pool)
	user1 := &models.User{
		Username:     uniqueMessagesUsername("user1"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user1)
	require.NoError(t, err)

	user2 := &models.User{
		Username:     uniqueMessagesUsername("user2"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user2)
	require.NoError(t, err)

	// Create conversation
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	// Create handler with mock hub
	messageRepo := models.NewMessageRepository(db.Pool)
	userSettingsRepo := models.NewUserSettingsRepository(db.Pool)
	hub := &mockHub{
		broadcastCalls: make([]*websocket.Message, 0),
		onlineUsers:    make(map[int]bool),
	}
	handler := NewMessagesHandler(db.Pool, messageRepo, convRepo, userSettingsRepo, hub, nil)

	cleanup := func() {
		db.Close()
	}

	return handler, db, user1.ID, user2.ID, conv.ID, hub, cleanup
}

func TestSendMessage_Text(t *testing.T) {
	handler, _, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Mark user2 as online
	hub.onlineUsers[user2ID] = true

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "base64encodedencryptedtext",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "base64encodedencryptedtext", response["encrypted_content"])
	assert.Equal(t, "text", response["message_type"])
	assert.Equal(t, float64(user1ID), response["sender_id"])
	assert.Equal(t, float64(user2ID), response["recipient_id"])

	// Verify WebSocket broadcasts (new_message and message_delivered)
	assert.Len(t, hub.broadcastCalls, 2, "Should broadcast new_message and message_delivered")
}

func TestSendMessage_WithMedia(t *testing.T) {
	handler, _, user1ID, _, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	mediaURL := "/uploads/test.jpg"
	mediaType := "image/jpeg"
	mediaSize := 12345

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "base64encodedimage",
		"message_type":       "image",
		"media_url":          mediaURL,
		"media_type":         mediaType,
		"media_size":         mediaSize,
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "image", response["message_type"])
	assert.Equal(t, mediaURL, response["media_url"])
	assert.Equal(t, mediaType, response["media_type"])
	assert.Equal(t, float64(mediaSize), response["media_size"])
}

func TestSendMessage_InvalidMessageType(t *testing.T) {
	handler, _, user1ID, _, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "base64encodedtext",
		"message_type":       "invalid_type",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "Invalid message type")
}

func TestSendMessage_NotParticipant(t *testing.T) {
	handler, db, _, _, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a third user not in the conversation
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueMessagesUsername("outsider"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, outsider)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "base64encodedtext",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetMessages(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create test messages
	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)

	for i := 0; i < 5; i++ {
		msg := &models.Message{
			ConversationID:    convID,
			SenderID:          user1ID,
			RecipientID:       user2ID,
			EncryptedContent:  fmt.Sprintf("message%d", i),
			MessageType:       "text",
			EncryptionVersion: "v1",
		}
		err := messageRepo.Create(ctx, msg)
		require.NoError(t, err)
	}

	router := gin.Default()
	router.GET("/conversations/:id/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetMessages(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/messages", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	messages := response["messages"].([]interface{})
	assert.Equal(t, 5, len(messages))
	assert.Equal(t, float64(50), response["limit"])
	assert.Equal(t, float64(0), response["offset"])
}

func TestGetMessages_Pagination(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create 10 test messages
	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)

	for i := 0; i < 10; i++ {
		msg := &models.Message{
			ConversationID:    convID,
			SenderID:          user1ID,
			RecipientID:       user2ID,
			EncryptedContent:  fmt.Sprintf("message%d", i),
			MessageType:       "text",
			EncryptionVersion: "v1",
		}
		err := messageRepo.Create(ctx, msg)
		require.NoError(t, err)
	}

	router := gin.Default()
	router.GET("/conversations/:id/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetMessages(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/messages?limit=3&offset=2", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	messages := response["messages"].([]interface{})
	assert.Equal(t, 3, len(messages))
	assert.Equal(t, float64(3), response["limit"])
	assert.Equal(t, float64(2), response["offset"])
}

func TestGetMessages_NotParticipant(t *testing.T) {
	handler, db, _, _, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a third user not in the conversation
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueMessagesUsername("outsider"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, outsider)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id/messages", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.GetMessages(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/messages", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetMessages_HidesBlockedSenderDM(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)

	allowedMessage := &models.Message{
		ConversationID:    convID,
		SenderID:          user2ID,
		RecipientID:       user1ID,
		EncryptedContent:  "visible",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, allowedMessage))

	hiddenMessage := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "should-hide-for-user2",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, hiddenMessage))

	_, err := db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, user2ID, user1ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id/messages", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.GetMessages(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/messages", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	messages := response["messages"].([]interface{})
	require.Len(t, messages, 1)
	msg := messages[0].(map[string]interface{})
	assert.Equal(t, float64(allowedMessage.ID), msg["id"])
}

func TestGetMessages_HidesBlockedSenderModMail(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	_, err := db.Pool.Exec(ctx, `
		UPDATE conversations
		SET conversation_type = 'mod_mail'
		WHERE id = $1
	`, convID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, is_moderator)
		VALUES ($1, $2, false), ($1, $3, true)
		ON CONFLICT DO NOTHING
	`, convID, user1ID, user2ID)
	require.NoError(t, err)

	messageRepo := models.NewMessageRepository(db.Pool)
	visible := &models.Message{
		ConversationID:    convID,
		SenderID:          user2ID,
		RecipientID:       user1ID,
		EncryptedContent:  "visible-modmail",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, visible))

	hidden := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "hidden-modmail",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, hidden))

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, user2ID, user1ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id/messages", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.GetMessages(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/messages", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	messages := response["messages"].([]interface{})
	require.Len(t, messages, 1)
	msg := messages[0].(map[string]interface{})
	assert.Equal(t, float64(visible.ID), msg["id"])
}

func TestGetMessages_UnblockRestoresVisibilityDM(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)

	fromUser1 := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "from-user1",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, fromUser1))

	fromUser2 := &models.Message{
		ConversationID:    convID,
		SenderID:          user2ID,
		RecipientID:       user1ID,
		EncryptedContent:  "from-user2",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, fromUser2))

	_, err := db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, user2ID, user1ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id/messages", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.GetMessages(c)
	})

	// While blocked: user2 should only see their own message.
	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/messages", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var blockedResponse map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &blockedResponse))
	blockedMessages := blockedResponse["messages"].([]interface{})
	require.Len(t, blockedMessages, 1)

	// Unblock and fetch again.
	_, err = db.Pool.Exec(ctx, `
		DELETE FROM blocked_users
		WHERE blocker_id = $1 AND blocked_id = $2
	`, user2ID, user1ID)
	require.NoError(t, err)

	reqAfter := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/messages", convID), nil)
	wAfter := httptest.NewRecorder()
	router.ServeHTTP(wAfter, reqAfter)
	require.Equal(t, http.StatusOK, wAfter.Code)

	var unblockedResponse map[string]interface{}
	require.NoError(t, json.Unmarshal(wAfter.Body.Bytes(), &unblockedResponse))
	unblockedMessages := unblockedResponse["messages"].([]interface{})
	require.Len(t, unblockedMessages, 2)
}

func TestMarkMessagesAsRead(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create unread messages
	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)

	for i := 0; i < 3; i++ {
		msg := &models.Message{
			ConversationID:    convID,
			SenderID:          user1ID,
			RecipientID:       user2ID,
			EncryptedContent:  fmt.Sprintf("message%d", i),
			MessageType:       "text",
			EncryptionVersion: "v1",
		}
		err := messageRepo.Create(ctx, msg)
		require.NoError(t, err)
	}

	router := gin.Default()
	router.POST("/conversations/:id/read", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.MarkAsRead(c)
	})

	req := httptest.NewRequest("POST", fmt.Sprintf("/conversations/%d/read", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify WebSocket notifications: 3 message_read events + 1 conversation_read event.
	var calls []*websocket.Message
	require.Eventually(t, func() bool {
		calls = hub.SnapshotBroadcastCalls()
		return len(calls) == 4
	}, 2*time.Second, 10*time.Millisecond)

	// Count event types
	messageReadCount := 0
	conversationReadCount := 0
	for _, call := range calls {
		assert.Equal(t, user1ID, call.RecipientID)
		switch call.Type {
		case "message_read":
			messageReadCount++
		case "conversation_read":
			conversationReadCount++
		}
	}

	assert.Equal(t, 3, messageReadCount, "Should send 3 individual message_read events")
	assert.Equal(t, 1, conversationReadCount, "Should send 1 conversation_read event")
}

func TestMarkMessagesAsRead_NotParticipant(t *testing.T) {
	handler, db, _, _, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a third user not in the conversation
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueMessagesUsername("outsider"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, outsider)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/:id/read", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.MarkAsRead(c)
	})

	req := httptest.NewRequest("POST", fmt.Sprintf("/conversations/%d/read", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestDeleteMessage(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a message
	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)
	msg := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err := messageRepo.Create(ctx, msg)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.DeleteMessage(c)
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/messages/%d", msg.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDeleteMessage_NotParticipant(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a message
	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)
	msg := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err := messageRepo.Create(ctx, msg)
	require.NoError(t, err)

	// Create a third user not in the conversation
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueMessagesUsername("outsider"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, outsider)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.DeleteMessage(c)
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/messages/%d", msg.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestDeleteMessage_DeleteForBothAsSender(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)
	msg := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err := messageRepo.Create(ctx, msg)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.DeleteMessage(c)
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/messages/%d?delete_for=both", msg.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var exists bool
	err = db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1)", msg.ID).Scan(&exists)
	require.NoError(t, err)
	assert.False(t, exists, "message should be hard deleted when both parties delete")
}

func TestDeleteMessage_DeleteForBothAsRecipient(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	messageRepo := models.NewMessageRepository(db.Pool)
	msg := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err := messageRepo.Create(ctx, msg)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.DeleteMessage(c)
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/messages/%d?delete_for=both", msg.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestSendMessage_Blocked(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// user2 blocks user1
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, user2ID, user1ID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "blocked message",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should be forbidden
	assert.Equal(t, http.StatusForbidden, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "cannot send messages to this user")
}

func TestSendMessage_NotBlocked(t *testing.T) {
	handler, _, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Mark user2 as online
	hub.onlineUsers[user2ID] = true

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "not blocked message",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should succeed
	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())
}

func TestSendMessage_AutoUnarchivesRecipientDM(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	_, err := db.Pool.Exec(ctx, `
		UPDATE conversations
		SET archived_for_user2 = TRUE,
		    conversation_type = NULL
		WHERE id = $1
	`, convID)
	require.NoError(t, err)

	hub.onlineUsers[user2ID] = true

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "auto unarchive recipient",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())

	var archivedForUser2 bool
	err = db.Pool.QueryRow(ctx, `
		SELECT COALESCE(archived_for_user2, FALSE)
		FROM conversations
		WHERE id = $1
	`, convID).Scan(&archivedForUser2)
	require.NoError(t, err)
	assert.False(t, archivedForUser2, "recipient archive flag should be cleared on new message")

	unarchiveEvent := findBroadcastByTypeAndRecipient(hub.SnapshotBroadcastCalls(), "conversation_unarchived", user2ID)
	require.NotNil(t, unarchiveEvent, "recipient should receive conversation_unarchived event")
}

func TestSendMessage_AutoUnarchiveDoesNotAffectSenderArchiveFlag(t *testing.T) {
	handler, db, user1ID, _, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	_, err := db.Pool.Exec(ctx, `
		UPDATE conversations
		SET archived_for_user1 = TRUE,
		    archived_for_user2 = TRUE
		WHERE id = $1
	`, convID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "sender archive unaffected",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())

	var archivedForUser1 bool
	var archivedForUser2 bool
	err = db.Pool.QueryRow(ctx, `
		SELECT COALESCE(archived_for_user1, FALSE), COALESCE(archived_for_user2, FALSE)
		FROM conversations
		WHERE id = $1
	`, convID).Scan(&archivedForUser1, &archivedForUser2)
	require.NoError(t, err)
	assert.True(t, archivedForUser1, "sender archive flag should remain unchanged")
	assert.False(t, archivedForUser2, "recipient archive flag should be cleared")
}

func TestSendMessage_RespectsRecipientAutoUnarchiveSetting(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	_, err := db.Pool.Exec(ctx, `
		UPDATE conversations
		SET archived_for_user2 = TRUE
		WHERE id = $1
	`, convID)
	require.NoError(t, err)

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, err := settingsRepo.CreateDefault(ctx, user2ID)
	require.NoError(t, err)
	settings.AutoUnarchiveOnMessage = false
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	hub.onlineUsers[user2ID] = true

	router := gin.Default()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.SendMessage(c)
	})

	body := map[string]interface{}{
		"conversation_id":    convID,
		"encrypted_content":  "respect auto-unarchive setting",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/messages", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())

	var archivedForUser2 bool
	err = db.Pool.QueryRow(ctx, `
		SELECT COALESCE(archived_for_user2, FALSE)
		FROM conversations
		WHERE id = $1
	`, convID).Scan(&archivedForUser2)
	require.NoError(t, err)
	assert.True(t, archivedForUser2, "recipient archive flag should remain set when setting is disabled")

	unarchiveEvent := findBroadcastByTypeAndRecipient(hub.SnapshotBroadcastCalls(), "conversation_unarchived", user2ID)
	assert.Nil(t, unarchiveEvent, "recipient should not receive conversation_unarchived event when disabled")
}

func TestMarkSingleMessageAsRead(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a message from user1 to user2
	messageRepo := models.NewMessageRepository(db.Pool)
	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err := messageRepo.Create(context.Background(), message)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/messages/:id/read", func(c *gin.Context) {
		c.Set("user_id", user2ID) // recipient marks as read
		handler.MarkSingleMessageAsRead(c)
	})

	req := httptest.NewRequest("POST", fmt.Sprintf("/messages/%d/read", message.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify WebSocket event was sent to sender
	require.Len(t, hub.broadcastCalls, 1)
	assert.Equal(t, "message_read", hub.broadcastCalls[0].Type)
	assert.Equal(t, user1ID, hub.broadcastCalls[0].RecipientID)

	payload := hub.broadcastCalls[0].Payload.(gin.H)
	assert.Equal(t, message.ID, payload["message_id"])
	assert.Equal(t, convID, payload["conversation_id"])
	assert.Equal(t, user2ID, payload["reader_id"])

	// Verify message is marked as read in database
	updatedMsg, err := messageRepo.GetByID(context.Background(), message.ID)
	require.NoError(t, err)
	assert.NotNil(t, updatedMsg.ReadAt)
}

func TestMarkSingleMessageAsRead_NotRecipient(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a message from user1 to user2
	messageRepo := models.NewMessageRepository(db.Pool)
	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err := messageRepo.Create(context.Background(), message)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/messages/:id/read", func(c *gin.Context) {
		c.Set("user_id", user1ID) // sender tries to mark as read (should fail)
		handler.MarkSingleMessageAsRead(c)
	})

	req := httptest.NewRequest("POST", fmt.Sprintf("/messages/%d/read", message.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestMarkSingleMessageAsRead_AlreadyRead(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create a message from user1 to user2
	messageRepo := models.NewMessageRepository(db.Pool)
	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "test message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	err := messageRepo.Create(context.Background(), message)
	require.NoError(t, err)

	// Mark as read first time
	err = messageRepo.MarkAsRead(context.Background(), message.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/messages/:id/read", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.MarkSingleMessageAsRead(c)
	})

	req := httptest.NewRequest("POST", fmt.Sprintf("/messages/%d/read", message.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Should not send duplicate WebSocket event
	assert.Len(t, hub.broadcastCalls, 0)
}

func TestMarkMessagesAsRead_SendsIndividualEvents(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	// Create multiple messages from user1 to user2
	messageRepo := models.NewMessageRepository(db.Pool)
	var messageIDs []int
	for i := 0; i < 3; i++ {
		message := &models.Message{
			ConversationID:    convID,
			SenderID:          user1ID,
			RecipientID:       user2ID,
			EncryptedContent:  fmt.Sprintf("test message %d", i),
			MessageType:       "text",
			EncryptionVersion: "v1",
		}
		err := messageRepo.Create(context.Background(), message)
		require.NoError(t, err)
		messageIDs = append(messageIDs, message.ID)
	}

	router := gin.Default()
	router.POST("/conversations/:id/read", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.MarkAsRead(c)
	})

	req := httptest.NewRequest("POST", fmt.Sprintf("/conversations/%d/read", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Should send individual message_read events + 1 conversation_read event
	var calls []*websocket.Message
	require.Eventually(t, func() bool {
		calls = hub.SnapshotBroadcastCalls()
		return len(calls) == 4
	}, 2*time.Second, 10*time.Millisecond)

	// First 3 should be message_read events
	readEvents := 0
	conversationReadEvents := 0
	for _, call := range calls {
		switch call.Type {
		case "message_read":
			readEvents++
			assert.Equal(t, user1ID, call.RecipientID)
			payload := call.Payload.(gin.H)
			assert.Contains(t, messageIDs, payload["message_id"])
		case "conversation_read":
			conversationReadEvents++
			assert.Equal(t, user1ID, call.RecipientID)
		}
	}

	assert.Equal(t, 3, readEvents)
	assert.Equal(t, 1, conversationReadEvents)
}

func createPinTestMessage(t *testing.T, db *database.Database, convID, senderID, recipientID int, body string) int {
	t.Helper()
	var messageID int
	err := db.Pool.QueryRow(context.Background(), `
		INSERT INTO messages (conversation_id, sender_id, recipient_id, encrypted_content, message_type)
		VALUES ($1, $2, $3, $4, 'text')
		RETURNING id
	`, convID, senderID, recipientID, body).Scan(&messageID)
	require.NoError(t, err)
	return messageID
}

func findBroadcastByTypeAndRecipient(calls []*websocket.Message, eventType string, recipientID int) *websocket.Message {
	for _, call := range calls {
		if call.Type == eventType && call.RecipientID == recipientID {
			return call
		}
	}
	return nil
}

func TestPinMessage_EnforcesMaxTenPinned(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	messageIDs := make([]int, 0, 11)
	for i := 0; i < 11; i++ {
		messageIDs = append(messageIDs, createPinTestMessage(t, db, convID, user1ID, user2ID, fmt.Sprintf("pin-%d", i)))
	}

	router := gin.Default()
	router.POST("/messages/:id/pin", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.PinMessage(c)
	})

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/pin", messageIDs[i]), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code, "message %d should pin successfully", i)
	}

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/pin", messageIDs[10]), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusConflict, w.Code, "11th pinned message should fail")

	var pinnedCount int
	err := db.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND pinned = TRUE
	`, convID).Scan(&pinnedCount)
	require.NoError(t, err)
	assert.Equal(t, 10, pinnedCount)
}

func TestPinMessage_BroadcastsPinEvent(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	messageID := createPinTestMessage(t, db, convID, user1ID, user2ID, "pin preview content")

	router := gin.Default()
	router.POST("/messages/:id/pin", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.PinMessage(c)
	})

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/pin", messageID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	calls := hub.SnapshotBroadcastCalls()
	require.Len(t, calls, 2)

	for _, recipientID := range []int{user1ID, user2ID} {
		call := findBroadcastByTypeAndRecipient(calls, "message_pinned", recipientID)
		require.NotNil(t, call)

		payload, ok := call.Payload.(models.PinEvent)
		require.True(t, ok)
		assert.Equal(t, "message_pinned", payload.Type)
		assert.Equal(t, messageID, payload.MessageID)
		assert.Equal(t, convID, payload.ConversationID)
		assert.NotNil(t, payload.PinnedBy)
		if payload.PinnedBy != nil {
			assert.Equal(t, user1ID, *payload.PinnedBy)
		}
		assert.NotNil(t, payload.PinnedAt)
		assert.Equal(t, "pin preview content", payload.Preview)
		assert.Equal(t, "text", payload.MessageType)
	}
}

func TestUnpinMessage_AdminCanUnpinOthers(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	messageID := createPinTestMessage(t, db, convID, user1ID, user2ID, "to-unpin")
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE messages
		SET pinned = TRUE, pinned_by = $2, pinned_at = NOW()
		WHERE id = $1
	`, messageID, user1ID)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	admin := &models.User{
		Username:     uniqueMessagesUsername("admin"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(context.Background(), admin))
	require.NoError(t, userRepo.UpdateRole(context.Background(), admin.ID, "admin"))

	router := gin.Default()
	router.DELETE("/messages/:id/pin", func(c *gin.Context) {
		c.Set("user_id", admin.ID)
		handler.UnpinMessage(c)
	})

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/messages/%d/pin", messageID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var pinned bool
	err = db.Pool.QueryRow(context.Background(), `SELECT pinned FROM messages WHERE id = $1`, messageID).Scan(&pinned)
	require.NoError(t, err)
	assert.False(t, pinned)
}

func TestUnpinMessage_NonAdminCannotUnpinOthers(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	messageID := createPinTestMessage(t, db, convID, user1ID, user2ID, "cannot-unpin")
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE messages
		SET pinned = TRUE, pinned_by = $2, pinned_at = NOW()
		WHERE id = $1
	`, messageID, user1ID)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/messages/:id/pin", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.UnpinMessage(c)
	})

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/messages/%d/pin", messageID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)

	var pinned bool
	err = db.Pool.QueryRow(context.Background(), `SELECT pinned FROM messages WHERE id = $1`, messageID).Scan(&pinned)
	require.NoError(t, err)
	assert.True(t, pinned)
}

func TestUnpinMessage_BroadcastsUnpinEvent(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	messageID := createPinTestMessage(t, db, convID, user1ID, user2ID, "unpinned preview content")
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE messages
		SET pinned = TRUE, pinned_by = $2, pinned_at = NOW()
		WHERE id = $1
	`, messageID, user1ID)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/messages/:id/pin", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.UnpinMessage(c)
	})

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/messages/%d/pin", messageID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	calls := hub.SnapshotBroadcastCalls()
	require.Len(t, calls, 2)

	for _, recipientID := range []int{user1ID, user2ID} {
		call := findBroadcastByTypeAndRecipient(calls, "message_unpinned", recipientID)
		require.NotNil(t, call)

		payload, ok := call.Payload.(models.PinEvent)
		require.True(t, ok)
		assert.Equal(t, "message_unpinned", payload.Type)
		assert.Equal(t, messageID, payload.MessageID)
		assert.Equal(t, convID, payload.ConversationID)
		assert.NotNil(t, payload.PinnedBy)
		if payload.PinnedBy != nil {
			assert.Equal(t, user1ID, *payload.PinnedBy)
		}
		assert.NotNil(t, payload.PinnedAt)
		assert.Equal(t, "unpinned preview content", payload.Preview)
		assert.Equal(t, "text", payload.MessageType)
	}
}

func TestGetPinnedMessages_ChronologicalOrder(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	firstPinned := createPinTestMessage(t, db, convID, user1ID, user2ID, "first")
	secondPinned := createPinTestMessage(t, db, convID, user2ID, user1ID, "second")
	_ = createPinTestMessage(t, db, convID, user1ID, user2ID, "un-pinned")

	now := time.Now().UTC()
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE messages
		SET pinned = TRUE, pinned_by = $2, pinned_at = $3
		WHERE id = $1
	`, firstPinned, user1ID, now.Add(-10*time.Minute))
	require.NoError(t, err)
	_, err = db.Pool.Exec(context.Background(), `
		UPDATE messages
		SET pinned = TRUE, pinned_by = $2, pinned_at = $3
		WHERE id = $1
	`, secondPinned, user2ID, now.Add(-1*time.Minute))
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id/pinned-messages", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetPinnedMessages(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/conversations/%d/pinned-messages", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	pinned := resp["pinned_messages"].([]interface{})
	require.Len(t, pinned, 2)

	first := pinned[0].(map[string]interface{})
	second := pinned[1].(map[string]interface{})
	assert.Equal(t, float64(firstPinned), first["id"])
	assert.Equal(t, float64(secondPinned), second["id"])
}

func TestEditMessage_Success(t *testing.T) {
	handler, db, user1ID, user2ID, convID, hub, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "original-encrypted",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, handler.messageRepo.Create(context.Background(), message))

	router := gin.Default()
	router.PATCH("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.EditMessage(c)
	})

	body := map[string]any{
		"encrypted_content":        "updated-encrypted",
		"sender_encrypted_content": "updated-sender-copy",
		"content":                  "updated plaintext",
		"encryption_version":       "v1",
	}
	bodyJSON, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/messages/%d", message.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var edited bool
	var editedAt *time.Time
	var currentEncrypted string
	var currentSenderEncrypted *string
	var originalContent *string
	err := db.Pool.QueryRow(context.Background(), `
		SELECT edited, edited_at, encrypted_content, sender_encrypted_content, original_content
		FROM messages
		WHERE id = $1
	`, message.ID).Scan(&edited, &editedAt, &currentEncrypted, &currentSenderEncrypted, &originalContent)
	require.NoError(t, err)

	assert.True(t, edited)
	require.NotNil(t, editedAt)
	assert.Equal(t, "updated-encrypted", currentEncrypted)
	require.NotNil(t, currentSenderEncrypted)
	assert.Equal(t, "updated-sender-copy", *currentSenderEncrypted)
	require.NotNil(t, originalContent)
	assert.Equal(t, "original-encrypted", *originalContent)

	var historyCount int
	var historyContent *string
	err = db.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*), MIN(content)
		FROM message_edit_history
		WHERE message_id = $1
	`, message.ID).Scan(&historyCount, &historyContent)
	require.NoError(t, err)
	assert.Equal(t, 1, historyCount)
	require.NotNil(t, historyContent)
	assert.Equal(t, "original-encrypted", *historyContent)

	calls := hub.SnapshotBroadcastCalls()
	require.Len(t, calls, 2)
	require.NotNil(t, findBroadcastByTypeAndRecipient(calls, "message_edited", user1ID))
	require.NotNil(t, findBroadcastByTypeAndRecipient(calls, "message_edited", user2ID))
}

func TestEditMessage_RejectsNonSender(t *testing.T) {
	handler, _, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "original-encrypted",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, handler.messageRepo.Create(context.Background(), message))

	router := gin.Default()
	router.PATCH("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.EditMessage(c)
	})

	body := map[string]any{
		"encrypted_content": "updated-encrypted",
	}
	bodyJSON, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/messages/%d", message.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
}

func TestEditMessage_RejectsAfter15Minutes(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "original-encrypted",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, handler.messageRepo.Create(context.Background(), message))

	_, err := db.Pool.Exec(context.Background(), `
		UPDATE messages SET sent_at = NOW() - INTERVAL '16 minutes' WHERE id = $1
	`, message.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.PATCH("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.EditMessage(c)
	})

	body := map[string]any{
		"encrypted_content": "updated-encrypted",
	}
	bodyJSON, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/messages/%d", message.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
}

func TestEditMessage_RejectsModMailConversation(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		UPDATE conversations SET conversation_type = 'mod_mail' WHERE id = $1
	`, convID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "original-encrypted",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, handler.messageRepo.Create(context.Background(), message))

	router := gin.Default()
	router.PATCH("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.EditMessage(c)
	})

	body := map[string]any{
		"encrypted_content": "updated-encrypted",
	}
	bodyJSON, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/messages/%d", message.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "Editing mod mail messages is not supported")
}

func TestEditMessage_CreatesParticipantNotification(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	handler.notifService = services.NewNotificationService(
		db.Pool,
		models.NewNotificationRepository(db.Pool),
		models.NewUserBaselineRepository(db.Pool),
		models.NewNotificationBatchRepository(db.Pool),
		models.NewUserSettingsRepository(db.Pool),
		models.NewPlatformPostRepository(db.Pool),
		models.NewPostCommentRepository(db.Pool),
		models.NewDeviceTokenRepository(db.Pool),
		nil,
		nil,
	)

	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "original-encrypted",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, handler.messageRepo.Create(context.Background(), message))

	router := gin.Default()
	router.PATCH("/messages/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.EditMessage(c)
	})

	body := map[string]any{
		"encrypted_content": "updated-encrypted",
	}
	bodyJSON, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/messages/%d", message.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	require.Eventually(t, func() bool {
		var count int
		err := db.Pool.QueryRow(context.Background(), `
			SELECT COUNT(*)
			FROM notifications
			WHERE user_id = $1 AND notification_type = 'message_edited' AND content_id = $2
		`, user2ID, message.ID).Scan(&count)
		require.NoError(t, err)
		return count == 1
	}, 2*time.Second, 50*time.Millisecond)
}

func TestGetMessageHistory_SuccessWithPagination(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "history-original",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, handler.messageRepo.Create(context.Background(), message))

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO message_edit_history (message_id, content, encrypted_content, edited_at, edited_by)
		VALUES
			($1, $2, $3, NOW() - INTERVAL '2 minutes', $4),
			($1, $5, $6, NOW() - INTERVAL '1 minutes', $4)
	`, message.ID, "v1", "enc-v1", user1ID, "v2", "enc-v2")
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/messages/:id/history", func(c *gin.Context) {
		c.Set("user_id", user2ID)
		handler.GetMessageHistory(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/messages/%d/history?limit=1&offset=0", message.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(2), resp["total"])
	assert.Equal(t, float64(1), resp["limit"])
	assert.Equal(t, float64(0), resp["offset"])

	history, ok := resp["history"].([]any)
	require.True(t, ok)
	require.Len(t, history, 1)
	first := history[0].(map[string]any)
	assert.Equal(t, "v1", first["content"])
}

func TestGetMessageHistory_RejectsNonParticipant(t *testing.T) {
	handler, db, user1ID, user2ID, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	message := &models.Message{
		ConversationID:    convID,
		SenderID:          user1ID,
		RecipientID:       user2ID,
		EncryptedContent:  "history-original",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, handler.messageRepo.Create(context.Background(), message))

	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueMessagesUsername("outsider"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(context.Background(), outsider))

	router := gin.Default()
	router.GET("/messages/:id/history", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.GetMessageHistory(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/messages/%d/history", message.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
}
