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
	broadcastCalls []*websocket.Message
	onlineUsers    map[int]bool
}

func (m *mockHub) Broadcast(msg *websocket.Message) {
	m.broadcastCalls = append(m.broadcastCalls, msg)
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

	ctx := context.Background()
	err = db.Migrate(ctx)
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
	hub := &mockHub{
		broadcastCalls: make([]*websocket.Message, 0),
		onlineUsers:    make(map[int]bool),
	}
	handler := NewMessagesHandler(db.Pool, messageRepo, convRepo, hub)

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

	// Verify WebSocket notifications: 3 message_read events + 1 conversation_read event
	assert.Len(t, hub.broadcastCalls, 4)

	// Count event types
	messageReadCount := 0
	conversationReadCount := 0
	for _, call := range hub.broadcastCalls {
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
	require.Len(t, hub.broadcastCalls, 4)

	// First 3 should be message_read events
	readEvents := 0
	conversationReadEvents := 0
	for _, call := range hub.broadcastCalls {
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
