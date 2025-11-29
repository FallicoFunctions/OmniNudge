package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var messagingTestCounter int64

func uniqueMessagingUsername(base string) string {
	id := atomic.AddInt64(&messagingTestCounter, 1)
	return fmt.Sprintf("%s_msg_%d_%d", base, time.Now().UnixNano(), id)
}

// TestCompleteMessageFlow tests the entire message lifecycle from conversation creation to message deletion
func TestCompleteMessageFlow(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ctx := context.Background()

	// Create two users
	user1 := createUser(t, deps.UserRepo, uniqueMessagingUsername("alice"), "user")
	user2 := createUser(t, deps.UserRepo, uniqueMessagingUsername("bob"), "user")

	token1, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)
	token2, _ := deps.AuthService.GenerateJWT(user2.ID, "", user2.Username, user2.Role)

	// STEP 1: User1 creates a conversation with User2
	createConvBody := fmt.Sprintf(`{"recipient_username":"%s"}`, user2.Username)
	req, _ := http.NewRequest("POST", "/api/v1/conversations", bytes.NewReader([]byte(createConvBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token1)
	w := doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var conversation models.Conversation
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &conversation))
	conversationID := conversation.ID

	// STEP 2: User1 sends a text message
	sendMsgBody := fmt.Sprintf(`{
		"conversation_id": %d,
		"encrypted_content": "encrypted_hello_world",
		"message_type": "text",
		"encryption_version": "v1"
	}`, conversationID)

	req, _ = http.NewRequest("POST", "/api/v1/messages", bytes.NewReader([]byte(sendMsgBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token1)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var message models.Message
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &message))

	assert.Equal(t, conversationID, message.ConversationID)
	assert.Equal(t, user1.ID, message.SenderID)
	assert.Equal(t, user2.ID, message.RecipientID)
	assert.Equal(t, "encrypted_hello_world", message.EncryptedContent)
	assert.Nil(t, message.ReadAt)

	// STEP 3: User2 fetches conversations
	req, _ = http.NewRequest("GET", "/api/v1/conversations", nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	var convResponse map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &convResponse))

	conversations := convResponse["conversations"].([]interface{})
	assert.Len(t, conversations, 1)

	// STEP 4: User2 fetches messages
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/v1/conversations/%d/messages", conversationID), nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	// STEP 5: User2 marks message as read
	req, _ = http.NewRequest("POST", fmt.Sprintf("/api/v1/messages/%d/read", message.ID), nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	// Verify message is marked as read
	readMessage, err := deps.MessageRepo.GetByID(ctx, message.ID)
	require.NoError(t, err)
	assert.NotNil(t, readMessage.ReadAt)
	assert.NotNil(t, readMessage.DeliveredAt)

	// STEP 6: User1 sends multiple messages
	for i := 0; i < 3; i++ {
		sendMsgBody = fmt.Sprintf(`{
			"conversation_id": %d,
			"encrypted_content": "message_%d",
			"message_type": "text",
			"encryption_version": "v1"
		}`, conversationID, i)

		req, _ = http.NewRequest("POST", "/api/v1/messages", bytes.NewReader([]byte(sendMsgBody)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token1)
		w = doRequest(t, deps.Router, req)
		require.Equal(t, http.StatusCreated, w.Code)
	}

	// STEP 7: User2 marks all messages as read
	req, _ = http.NewRequest("POST", fmt.Sprintf("/api/v1/conversations/%d/read", conversationID), nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	// Verify all messages are read
	messages, err := deps.MessageRepo.GetByConversationID(ctx, conversationID, user2.ID, 10, 0)
	require.NoError(t, err)
	for _, msg := range messages {
		if msg.RecipientID == user2.ID {
			assert.NotNil(t, msg.ReadAt, "All received messages should be marked as read")
		}
	}
}

// TestMessageBlocking verifies that blocked users cannot send messages
func TestMessageBlocking(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	// Create users
	user1 := createUser(t, deps.UserRepo, uniqueMessagingUsername("alice"), "user")
	user2 := createUser(t, deps.UserRepo, uniqueMessagingUsername("bob"), "user")

	token1, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)
	token2, _ := deps.AuthService.GenerateJWT(user2.ID, "", user2.Username, user2.Role)

	// User1 creates conversation
	createConvBody := fmt.Sprintf(`{"recipient_username":"%s"}`, user2.Username)
	req, _ := http.NewRequest("POST", "/api/v1/conversations", bytes.NewReader([]byte(createConvBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token1)
	w := doRequest(t, deps.Router, req)

	var conversation models.Conversation
	json.Unmarshal(w.Body.Bytes(), &conversation)

	// User2 blocks User1
	blockBody := fmt.Sprintf(`{"username":"%s"}`, user1.Username)
	req, _ = http.NewRequest("POST", "/api/v1/users/block", bytes.NewReader([]byte(blockBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token2)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	// User1 tries to send a message (should fail with 403)
	sendMsgBody := fmt.Sprintf(`{
		"conversation_id": %d,
		"encrypted_content": "blocked_message",
		"message_type": "text",
		"encryption_version": "v1"
	}`, conversation.ID)

	req, _ = http.NewRequest("POST", "/api/v1/messages", bytes.NewReader([]byte(sendMsgBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token1)
	w = doRequest(t, deps.Router, req)

	assert.Equal(t, http.StatusForbidden, w.Code)

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)
	assert.Contains(t, response["error"], "cannot send messages")
}

// TestMessageDeletion tests soft and hard deletion of messages
func TestMessageDeletion(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ctx := context.Background()

	// Create users
	user1 := createUser(t, deps.UserRepo, uniqueMessagingUsername("alice"), "user")
	user2 := createUser(t, deps.UserRepo, uniqueMessagingUsername("bob"), "user")

	token1, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)
	token2, _ := deps.AuthService.GenerateJWT(user2.ID, "", user2.Username, user2.Role)

	// Create conversation
	createConvBody := fmt.Sprintf(`{"recipient_username":"%s"}`, user2.Username)
	req, _ := http.NewRequest("POST", "/api/v1/conversations", bytes.NewReader([]byte(createConvBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token1)
	w := doRequest(t, deps.Router, req)

	var conversation models.Conversation
	json.Unmarshal(w.Body.Bytes(), &conversation)

	// Send message
	sendMsgBody := fmt.Sprintf(`{
		"conversation_id": %d,
		"encrypted_content": "test_message",
		"message_type": "text",
		"encryption_version": "v1"
	}`, conversation.ID)

	req, _ = http.NewRequest("POST", "/api/v1/messages", bytes.NewReader([]byte(sendMsgBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token1)
	w = doRequest(t, deps.Router, req)

	var message models.Message
	json.Unmarshal(w.Body.Bytes(), &message)

	// User1 soft deletes message
	req, _ = http.NewRequest("DELETE", fmt.Sprintf("/api/v1/messages/%d", message.ID), nil)
	req.Header.Set("Authorization", "Bearer "+token1)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	// User1 should not see the message
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/v1/conversations/%d/messages", conversation.ID), nil)
	req.Header.Set("Authorization", "Bearer "+token1)
	w = doRequest(t, deps.Router, req)

	var msgResponse map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &msgResponse)

	messages := msgResponse["messages"].([]interface{})
	assert.Len(t, messages, 0, "User1 should not see deleted message")

	// User2 should still see the message
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/v1/conversations/%d/messages", conversation.ID), nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	w = doRequest(t, deps.Router, req)

	json.Unmarshal(w.Body.Bytes(), &msgResponse)
	messages = msgResponse["messages"].([]interface{})
	assert.Len(t, messages, 1, "User2 should still see the message")

	// User2 also deletes message (triggers hard delete)
	req, _ = http.NewRequest("DELETE", fmt.Sprintf("/api/v1/messages/%d", message.ID), nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	w = doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	// Message should be hard deleted from database
	deletedMsg, err := deps.MessageRepo.GetByID(ctx, message.ID)
	assert.Error(t, err)
	assert.Nil(t, deletedMsg)
}

// TestUserOnlineStatus tests the online status endpoint
func TestUserOnlineStatus(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	// Create test users
	user1 := createUser(t, deps.UserRepo, uniqueMessagingUsername("online"), "user")
	user2 := createUser(t, deps.UserRepo, uniqueMessagingUsername("offline"), "user")

	// Check status (both offline initially)
	req, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/users/status?user_ids=%d,%d", user1.ID, user2.ID), nil)
	w := doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))

	statuses := response["statuses"].(map[string]interface{})
	assert.NotNil(t, statuses)
	assert.False(t, statuses[fmt.Sprintf("%d", user1.ID)].(bool))
	assert.False(t, statuses[fmt.Sprintf("%d", user2.ID)].(bool))
}
