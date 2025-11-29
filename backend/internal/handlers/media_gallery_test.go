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

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var mediaGalleryTestCounter int64

func uniqueMediaGalleryUsername(base string) string {
	id := atomic.AddInt64(&mediaGalleryTestCounter, 1)
	return fmt.Sprintf("%s_media_gallery_%d_%d", base, time.Now().UnixNano(), id)
}

func setupMediaGalleryHandlerTest(t *testing.T) (*MediaGalleryHandler, *database.Database, int, int, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Create test users
	userRepo := models.NewUserRepository(db.Pool)
	user1 := &models.User{
		Username:     uniqueMediaGalleryUsername("user1"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user1)
	require.NoError(t, err)

	user2 := &models.User{
		Username:     uniqueMediaGalleryUsername("user2"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user2)
	require.NoError(t, err)

	// Create conversation
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	// Create handler
	handler := NewMediaGalleryHandler(db.Pool)

	cleanup := func() {
		db.Close()
	}

	return handler, db, user1.ID, user2.ID, conv.ID, cleanup
}

func createTestMessage(t *testing.T, db *database.Database, convID, senderID, recipientID int, messageType, mediaURL string) int {
	ctx := context.Background()

	var messageID int
	query := `
		INSERT INTO messages (conversation_id, sender_id, recipient_id, encrypted_content, message_type, media_url, media_type, media_size, sent_at)
		VALUES ($1, $2, $3, 'encrypted', $4, $5, 'image/jpeg', 1000, CURRENT_TIMESTAMP)
		RETURNING id
	`
	err := db.Pool.QueryRow(ctx, query, convID, senderID, recipientID, messageType, mediaURL).Scan(&messageID)
	require.NoError(t, err)

	return messageID
}

func TestGetConversationMedia_All(t *testing.T) {
	handler, db, user1ID, user2ID, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create test messages
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image1.jpg")
	createTestMessage(t, db, convID, user2ID, user1ID, "video", "/uploads/video1.mp4")
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image2.jpg")
	createTestMessage(t, db, convID, user1ID, user2ID, "text", "") // Text message, should not appear

	router := gin.Default()
	router.GET("/conversations/:id/media", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversationMedia(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media?filter=all", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, float64(convID), response["conversation_id"])
	assert.Equal(t, "all", response["filter"])
	assert.Equal(t, float64(3), response["total"])

	items := response["items"].([]interface{})
	assert.Equal(t, 3, len(items))
}

func TestGetConversationMedia_MineOnly(t *testing.T) {
	handler, db, user1ID, user2ID, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create test messages
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image1.jpg")
	createTestMessage(t, db, convID, user2ID, user1ID, "video", "/uploads/video1.mp4")
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image2.jpg")
	createTestMessage(t, db, convID, user2ID, user1ID, "gif", "/uploads/gif1.gif")

	router := gin.Default()
	router.GET("/conversations/:id/media", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversationMedia(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media?filter=mine", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "mine", response["filter"])
	assert.Equal(t, float64(2), response["total"])

	items := response["items"].([]interface{})
	assert.Equal(t, 2, len(items))

	// All items should be mine
	for _, item := range items {
		itemMap := item.(map[string]interface{})
		assert.Equal(t, true, itemMap["is_mine"])
	}
}

func TestGetConversationMedia_TheirsOnly(t *testing.T) {
	handler, db, user1ID, user2ID, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create test messages
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image1.jpg")
	createTestMessage(t, db, convID, user2ID, user1ID, "video", "/uploads/video1.mp4")
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image2.jpg")
	createTestMessage(t, db, convID, user2ID, user1ID, "gif", "/uploads/gif1.gif")

	router := gin.Default()
	router.GET("/conversations/:id/media", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversationMedia(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media?filter=theirs", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "theirs", response["filter"])
	assert.Equal(t, float64(2), response["total"])

	items := response["items"].([]interface{})
	assert.Equal(t, 2, len(items))

	// All items should be theirs
	for _, item := range items {
		itemMap := item.(map[string]interface{})
		assert.Equal(t, false, itemMap["is_mine"])
	}
}

func TestGetConversationMedia_Pagination(t *testing.T) {
	handler, db, user1ID, user2ID, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create 5 test messages
	for i := 0; i < 5; i++ {
		createTestMessage(t, db, convID, user1ID, user2ID, "image", fmt.Sprintf("/uploads/image%d.jpg", i))
	}

	router := gin.Default()
	router.GET("/conversations/:id/media", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversationMedia(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media?limit=2&offset=1", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, float64(5), response["total"])
	assert.Equal(t, float64(2), response["limit"])
	assert.Equal(t, float64(1), response["offset"])

	items := response["items"].([]interface{})
	assert.Equal(t, 2, len(items))
}

func TestGetConversationMedia_InvalidFilter(t *testing.T) {
	handler, _, user1ID, _, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/conversations/:id/media", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversationMedia(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media?filter=invalid", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "Invalid filter")
}

func TestGetConversationMedia_Forbidden(t *testing.T) {
	handler, db, _, _, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create a third user not in the conversation
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{
		Username:     uniqueMediaGalleryUsername("outsider"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, outsider)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id/media", func(c *gin.Context) {
		c.Set("user_id", outsider.ID)
		handler.GetConversationMedia(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestFindMediaIndex_All(t *testing.T) {
	handler, db, user1ID, user2ID, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create test messages
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image1.jpg")
	msg2ID := createTestMessage(t, db, convID, user2ID, user1ID, "video", "/uploads/video1.mp4")
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image2.jpg")

	router := gin.Default()
	router.GET("/conversations/:id/media/:messageId/index", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.FindMediaIndex(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media/%d/index?filter=all", convID, msg2ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, float64(msg2ID), response["message_id"])
	assert.Equal(t, float64(1), response["index"]) // Second message, index 1
	assert.Equal(t, "all", response["filter"])
}

func TestFindMediaIndex_MineOnly(t *testing.T) {
	handler, db, user1ID, user2ID, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create test messages
	createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image1.jpg")
	createTestMessage(t, db, convID, user2ID, user1ID, "video", "/uploads/video1.mp4")
	msg3ID := createTestMessage(t, db, convID, user1ID, user2ID, "image", "/uploads/image2.jpg")

	router := gin.Default()
	router.GET("/conversations/:id/media/:messageId/index", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.FindMediaIndex(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media/%d/index?filter=mine", convID, msg3ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, float64(msg3ID), response["message_id"])
	assert.Equal(t, float64(1), response["index"]) // Second of user1's messages, index 1
	assert.Equal(t, "mine", response["filter"])
}

func TestFindMediaIndex_NotFound(t *testing.T) {
	handler, db, user1ID, user2ID, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	// Create test messages - only user2's messages
	createTestMessage(t, db, convID, user2ID, user1ID, "video", "/uploads/video1.mp4")
	msg2ID := createTestMessage(t, db, convID, user2ID, user1ID, "image", "/uploads/image1.jpg")

	router := gin.Default()
	router.GET("/conversations/:id/media/:messageId/index", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.FindMediaIndex(c)
	})

	// Try to find user2's message with filter=mine (should not be found)
	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media/%d/index?filter=mine", convID, msg2ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "not found")
}

func TestFindMediaIndex_InvalidFilter(t *testing.T) {
	handler, _, user1ID, _, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/conversations/:id/media/:messageId/index", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.FindMediaIndex(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media/123/index?filter=invalid", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetConversationMedia_EmptyGallery(t *testing.T) {
	handler, _, user1ID, _, convID, cleanup := setupMediaGalleryHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/conversations/:id/media", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversationMedia(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/media", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, float64(0), response["total"])
	items := response["items"].([]interface{})
	assert.Equal(t, 0, len(items))
}
