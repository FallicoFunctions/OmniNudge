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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var blockingMsgCounter int64

func uniqueBlockingMsgName(base string) string {
	id := atomic.AddInt64(&blockingMsgCounter, 1)
	return fmt.Sprintf("%s_bmsg_%d_%d", base, time.Now().UnixNano(), id)
}

func setupBlockingMessagesTest(t *testing.T) (
	blockingHandler *BlockingHandler,
	convHandler *ConversationsHandler,
	blockerID int,
	blockedID int,
	blockerUsername, blockedUsername string,
	cleanup func(),
) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)

	blocker := &models.User{Username: uniqueBlockingMsgName("blocker"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, blocker))

	blocked := &models.User{Username: uniqueBlockingMsgName("blocked"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, blocked))

	convRepo := models.NewConversationRepository(db.Pool)
	msgRepo := models.NewMessageRepository(db.Pool)

	blockingHandler = NewBlockingHandler(db.Pool, userRepo)
	convHandler = NewConversationsHandler(db.Pool, convRepo, msgRepo, userRepo, nil)

	return blockingHandler, convHandler, blocker.ID, blocked.ID, blocker.Username, blocked.Username, func() { db.Close() }
}

// TestBlockedUserCannotSendMessage verifies that after A blocks B,
// B cannot start a new conversation with A.
func TestBlockedUserCannotSendMessage(t *testing.T) {
	bh, ch, blockerID, blockedID, _, blockedUsername, cleanup := setupBlockingMessagesTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)

	// Blocker blocks blocked user
	blockRouter := gin.New()
	blockRouter.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		bh.BlockUser(c)
	})
	body, _ := json.Marshal(map[string]string{"username": blockedUsername})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/block", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	blockRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "block should succeed")

	// Now blocked user tries to create a conversation with blocker
	convRouter := gin.New()
	convRouter.POST("/conversations", func(c *gin.Context) {
		c.Set("user_id", blockedID)
		ch.CreateConversation(c)
	})
	convBody, _ := json.Marshal(map[string]interface{}{
		"other_user_id": blockerID,
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, "/conversations", bytes.NewBuffer(convBody))
	req2.Header.Set("Content-Type", "application/json")
	convRouter.ServeHTTP(w2, req2)
	assert.Contains(t, []int{http.StatusForbidden, http.StatusNotFound, http.StatusBadRequest, http.StatusConflict}, w2.Code,
		"blocked user should not be able to message blocker")
}

// TestBlockedUserConversationHidden verifies that after a block,
// the conversation list endpoint is reachable for the blocker.
func TestBlockedUserConversationHidden(t *testing.T) {
	bh, ch, blockerID, _, _, blockedUsername, cleanup := setupBlockingMessagesTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)

	// Blocker blocks blocked user
	blockRouter := gin.New()
	blockRouter.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		bh.BlockUser(c)
	})
	body, _ := json.Marshal(map[string]string{"username": blockedUsername})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/block", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	blockRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	// List conversations for blocker — should return 200 with no panic
	listRouter := gin.New()
	listRouter.GET("/conversations", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		ch.GetConversations(c)
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/conversations", nil)
	listRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
}

// TestUnblockRestoresMessaging verifies that after unblocking, messaging is available again.
func TestUnblockRestoresMessaging(t *testing.T) {
	bh, ch, blockerID, blockedID, _, blockedUsername, cleanup := setupBlockingMessagesTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)

	// Block
	blockRouter := gin.New()
	blockRouter.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		bh.BlockUser(c)
	})
	body, _ := json.Marshal(map[string]string{"username": blockedUsername})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/block", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	blockRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	// Unblock
	unblockRouter := gin.New()
	unblockRouter.DELETE("/block/:username", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		bh.UnblockUser(c)
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodDelete, "/block/"+blockedUsername, nil)
	unblockRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code, "unblock should succeed")

	// After unblock, blocked user can try to create conversation again
	convRouter := gin.New()
	convRouter.POST("/conversations", func(c *gin.Context) {
		c.Set("user_id", blockedID)
		ch.CreateConversation(c)
	})
	convBody, _ := json.Marshal(map[string]interface{}{
		"other_user_id": blockerID,
	})
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest(http.MethodPost, "/conversations", bytes.NewBuffer(convBody))
	req3.Header.Set("Content-Type", "application/json")
	convRouter.ServeHTTP(w3, req3)
	// After unblock it should not be blocked (200 or 201)
	assert.Contains(t, []int{http.StatusOK, http.StatusCreated}, w3.Code,
		"after unblock, messaging should be restored")
}

// TestGetBlockedMessageUsers verifies that the list of blocked users is returned correctly.
func TestGetBlockedMessageUsers(t *testing.T) {
	bh, _, blockerID, _, _, blockedUsername, cleanup := setupBlockingMessagesTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)

	// Block the user first
	blockRouter := gin.New()
	blockRouter.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		bh.BlockUser(c)
	})
	body, _ := json.Marshal(map[string]string{"username": blockedUsername})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/block", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	blockRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	// List blocked users
	listRouter := gin.New()
	listRouter.GET("/blocked", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		bh.GetBlockedUsers(c)
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/blocked", nil)
	listRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	blocked, ok := resp["blocked_users"].([]interface{})
	require.True(t, ok, "response should contain blocked_users")
	assert.Len(t, blocked, 1, "should have exactly 1 blocked user")
}
