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

var conversationsTestCounter int64

func uniqueConversationsUsername(base string) string {
	id := atomic.AddInt64(&conversationsTestCounter, 1)
	return fmt.Sprintf("%s_conversations_%d_%d", base, time.Now().UnixNano(), id)
}

func setupConversationsHandlerTest(t *testing.T) (*ConversationsHandler, *database.Database, int, int, func()) {
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
	handler := NewConversationsHandler(db.Pool, convRepo, messageRepo, userRepo)

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

func TestCreateConversation_BlockedForbidden(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, user2ID, user1ID)
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

	assert.Equal(t, http.StatusForbidden, w.Code)
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

func TestMuteAndUnmuteConversation(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	router := gin.Default()
	router.PUT("/conversations/:id/mute", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.MuteConversation(c)
	})
	router.PUT("/conversations/:id/unmute", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.UnmuteConversation(c)
	})

	muteReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/conversations/%d/mute", conv.ID), nil)
	muteRes := httptest.NewRecorder()
	router.ServeHTTP(muteRes, muteReq)
	require.Equal(t, http.StatusOK, muteRes.Code, "mute response: %s", muteRes.Body.String())

	var muted bool
	err = db.Pool.QueryRow(ctx, `
		SELECT muted FROM conversation_notification_settings
		WHERE conversation_id = $1 AND user_id = $2
	`, conv.ID, user1ID).Scan(&muted)
	require.NoError(t, err)
	assert.True(t, muted)

	unmuteReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/conversations/%d/unmute", conv.ID), nil)
	unmuteRes := httptest.NewRecorder()
	router.ServeHTTP(unmuteRes, unmuteReq)
	require.Equal(t, http.StatusOK, unmuteRes.Code, "unmute response: %s", unmuteRes.Body.String())

	err = db.Pool.QueryRow(ctx, `
		SELECT muted FROM conversation_notification_settings
		WHERE conversation_id = $1 AND user_id = $2
	`, conv.ID, user1ID).Scan(&muted)
	require.NoError(t, err)
	assert.False(t, muted)
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

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/conversations/%d?delete_for=both", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Conversation should still exist (soft-deleted for user1)
	existing, err := convRepo.GetByID(ctx, conv.ID)
	require.NoError(t, err)
	assert.NotNil(t, existing)

	// Deleted user should not see the conversation
	user1Convs, err := convRepo.GetByUserID(ctx, user1ID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, user1Convs, 0)

	// Other user should still see the conversation
	user2Convs, err := convRepo.GetByUserID(ctx, user2ID, 10, 0, false)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(user2Convs), 1)

	// User1 messages should be hard-deleted
	user2Messages, err := messageRepo.GetByConversationID(ctx, conv.ID, user2ID, 10, 0)
	require.NoError(t, err)
	assert.Len(t, user2Messages, 0)
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

func TestArchiveConversation_DM_PerUserArchive(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	router := gin.Default()
	router.PUT("/conversations/:id/archive", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.ArchiveConversation(c)
	})

	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/conversations/%d/archive", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	var archivedForUser1, archivedForUser2 bool
	err = db.Pool.QueryRow(ctx, `
		SELECT COALESCE(archived_for_user1, FALSE), COALESCE(archived_for_user2, FALSE)
		FROM conversations
		WHERE id = $1
	`, conv.ID).Scan(&archivedForUser1, &archivedForUser2)
	require.NoError(t, err)
	assert.True(t, archivedForUser1)
	assert.False(t, archivedForUser2)

	user1Convs, err := convRepo.GetByUserID(ctx, user1ID, 20, 0, false)
	require.NoError(t, err)
	assert.Len(t, user1Convs, 0, "archived conversation should be hidden for archiving user")

	user2Convs, err := convRepo.GetByUserID(ctx, user2ID, 20, 0, false)
	require.NoError(t, err)
	assert.Len(t, user2Convs, 1, "conversation should remain visible for other participant")
}

func TestUnarchiveConversation_DM_ClearsPerUserArchive(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		UPDATE conversations SET archived_for_user1 = TRUE WHERE id = $1
	`, conv.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.PUT("/conversations/:id/unarchive", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.UnarchiveConversation(c)
	})

	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/conversations/%d/unarchive", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	var archivedForUser1 bool
	err = db.Pool.QueryRow(ctx, `
		SELECT COALESCE(archived_for_user1, FALSE)
		FROM conversations
		WHERE id = $1
	`, conv.ID).Scan(&archivedForUser1)
	require.NoError(t, err)
	assert.False(t, archivedForUser1)
}

func TestGetConversations_IncludeArchived(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	convA, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	user3 := &models.User{
		Username:     uniqueConversationsUsername("user3_archive"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user3))
	convB, err := convRepo.Create(ctx, user1ID, user3.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		UPDATE conversations SET archived_for_user1 = TRUE WHERE id = $1
	`, convA.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversations(c)
	})

	activeReq := httptest.NewRequest(http.MethodGet, "/conversations", nil)
	activeRes := httptest.NewRecorder()
	router.ServeHTTP(activeRes, activeReq)
	require.Equal(t, http.StatusOK, activeRes.Code, "active response: %s", activeRes.Body.String())

	var activeBody map[string]interface{}
	require.NoError(t, json.Unmarshal(activeRes.Body.Bytes(), &activeBody))
	activeConversations := activeBody["conversations"].([]interface{})
	assert.Len(t, activeConversations, 1, "default listing should exclude archived conversations")

	archivedReq := httptest.NewRequest(http.MethodGet, "/conversations?include_archived=true", nil)
	archivedRes := httptest.NewRecorder()
	router.ServeHTTP(archivedRes, archivedReq)
	require.Equal(t, http.StatusOK, archivedRes.Code, "archived response: %s", archivedRes.Body.String())

	var archivedBody map[string]interface{}
	require.NoError(t, json.Unmarshal(archivedRes.Body.Bytes(), &archivedBody))
	allConversations := archivedBody["conversations"].([]interface{})
	assert.Len(t, allConversations, 2, "include_archived listing should include archived conversations")

	_ = convB // keep explicit reference to ensure second conversation creation remains intentional
}

func TestGetArchivedConversations_OnlyArchived(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	archivedConv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	user3 := &models.User{
		Username:     uniqueConversationsUsername("u3_arch"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user3))
	activeConv, err := convRepo.Create(ctx, user1ID, user3.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		UPDATE conversations SET archived_for_user1 = TRUE WHERE id = $1
	`, archivedConv.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/archived", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetArchivedConversations(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/conversations/archived", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	conversations := response["conversations"].([]interface{})
	require.Len(t, conversations, 1)

	convMap := conversations[0].(map[string]interface{})
	assert.Equal(t, float64(archivedConv.ID), convMap["id"])
	assert.NotEqual(t, float64(activeConv.ID), convMap["id"])
}

func TestGetArchivedConversations_StrictCursorPagination(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)

	archivedNewer, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	user3 := &models.User{
		Username:     uniqueConversationsUsername("u3archp"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user3))
	archivedOlder, err := convRepo.Create(ctx, user1ID, user3.ID)
	require.NoError(t, err)

	user4 := &models.User{
		Username:     uniqueConversationsUsername("u4actp"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user4))
	activeNewest, err := convRepo.Create(ctx, user1ID, user4.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		UPDATE conversations
		SET archived_for_user1 = TRUE
		WHERE id IN ($1, $2)
	`, archivedNewer.ID, archivedOlder.ID)
	require.NoError(t, err)

	now := time.Now().UTC()
	_, err = db.Pool.Exec(ctx, `
		UPDATE conversations
		SET last_message_at = CASE
			WHEN id = $1 THEN $4
			WHEN id = $2 THEN $5
			WHEN id = $3 THEN $6
			ELSE last_message_at
		END
		WHERE id IN ($1, $2, $3)
	`, archivedNewer.ID, archivedOlder.ID, activeNewest.ID, now.Add(-1*time.Minute), now.Add(-3*time.Minute), now)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/archived", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetArchivedConversations(c)
	})

	firstReq := httptest.NewRequest(http.MethodGet, "/conversations/archived?limit=1", nil)
	firstRes := httptest.NewRecorder()
	router.ServeHTTP(firstRes, firstReq)
	require.Equal(t, http.StatusOK, firstRes.Code, "response: %s", firstRes.Body.String())

	var firstBody map[string]interface{}
	require.NoError(t, json.Unmarshal(firstRes.Body.Bytes(), &firstBody))
	firstConversations := firstBody["conversations"].([]interface{})
	require.Len(t, firstConversations, 1)
	firstConv := firstConversations[0].(map[string]interface{})
	assert.Equal(t, float64(archivedNewer.ID), firstConv["id"], "active conversation must not appear in archived pagination")
	require.NotEmpty(t, firstBody["next_cursor"])

	nextCursor := firstBody["next_cursor"].(string)
	secondReq := httptest.NewRequest(http.MethodGet, "/conversations/archived?limit=1&cursor="+nextCursor, nil)
	secondRes := httptest.NewRecorder()
	router.ServeHTTP(secondRes, secondReq)
	require.Equal(t, http.StatusOK, secondRes.Code, "response: %s", secondRes.Body.String())

	var secondBody map[string]interface{}
	require.NoError(t, json.Unmarshal(secondRes.Body.Bytes(), &secondBody))
	secondConversations := secondBody["conversations"].([]interface{})
	require.Len(t, secondConversations, 1)
	secondConv := secondConversations[0].(map[string]interface{})
	assert.Equal(t, float64(archivedOlder.ID), secondConv["id"])
}

func TestArchiveConversationBatch_Success(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv1, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	user3 := &models.User{
		Username:     uniqueConversationsUsername("batchu3"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user3))
	conv2, err := convRepo.Create(ctx, user1ID, user3.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/archive-batch", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.ArchiveConversationBatch(c)
	})

	body := map[string]interface{}{
		"conversation_ids": []int{conv1.ID, conv2.ID, conv2.ID}, // duplicate should be de-duped
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/conversations/archive-batch", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())

	var archivedForUser1Conv1 bool
	err = db.Pool.QueryRow(ctx, `SELECT COALESCE(archived_for_user1, false) FROM conversations WHERE id = $1`, conv1.ID).Scan(&archivedForUser1Conv1)
	require.NoError(t, err)
	assert.True(t, archivedForUser1Conv1)

	var archivedForUser1Conv2 bool
	err = db.Pool.QueryRow(ctx, `SELECT COALESCE(archived_for_user1, false) FROM conversations WHERE id = $1`, conv2.ID).Scan(&archivedForUser1Conv2)
	require.NoError(t, err)
	assert.True(t, archivedForUser1Conv2)
}

func TestArchiveConversationBatch_AllOrNothingRollback(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	authorizedConv, err := convRepo.Create(ctx, user1ID, user2ID)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	user3 := &models.User{
		Username:     uniqueConversationsUsername("batchunauth3"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user3))
	user4 := &models.User{
		Username:     uniqueConversationsUsername("batchunauth4"),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user4))

	unauthorizedConv, err := convRepo.Create(ctx, user3.ID, user4.ID) // user1 is not participant
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/archive-batch", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.ArchiveConversationBatch(c)
	})

	body := map[string]interface{}{
		"conversation_ids": []int{authorizedConv.ID, unauthorizedConv.ID},
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/conversations/archive-batch", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code, "response: %s", w.Body.String())

	var archivedForUser1 bool
	err = db.Pool.QueryRow(ctx, `SELECT COALESCE(archived_for_user1, false) FROM conversations WHERE id = $1`, authorizedConv.ID).Scan(&archivedForUser1)
	require.NoError(t, err)
	assert.False(t, archivedForUser1, "authorized conversation should not be archived when batch fails")
}
