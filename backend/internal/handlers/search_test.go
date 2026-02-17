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
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	searchTestSuffix  = time.Now().UnixNano()
	searchTestCounter int64
)

func uniqueSearchName(base string) string {
	id := atomic.AddInt64(&searchTestCounter, 1)
	return fmt.Sprintf("%s_%d_%d", base, searchTestSuffix, id)
}

func setupSearchHandlerTest(t *testing.T) (*SearchHandler, *database.Database, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	handler := NewSearchHandler(db.Pool)

	cleanup := func() {
		db.Close()
	}

	return handler, db, cleanup
}

func TestSearchPosts(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test data
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueSearchName("author"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      uniqueSearchName("test_hub"),
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	bodyText := "This post contains golang programming content"
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    &hub.ID,
		Title:    "Golang Tutorial",
		Body:     &bodyText,
	}
	err = postRepo.Create(ctx, post)
	require.NoError(t, err)

	// Create request
	router := gin.Default()
	router.GET("/search/posts", handler.SearchPosts)

	req := httptest.NewRequest("GET", "/search/posts?q=golang", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	posts := response["posts"].([]interface{})
	assert.GreaterOrEqual(t, len(posts), 1, "Should find the golang post")
}

func TestSearchComments(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test data
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueSearchName("commenter"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      uniqueSearchName("test_hub"),
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    &hub.ID,
		Title:    "Test Post",
	}
	err = postRepo.Create(ctx, post)
	require.NoError(t, err)

	commentRepo := models.NewPostCommentRepository(db.Pool)
	comment := &models.PostComment{
		PostID: post.ID,
		UserID: user.ID,
		Body:   "This is a comment about typescript development",
	}
	err = commentRepo.Create(ctx, comment)
	require.NoError(t, err)

	// Create request
	router := gin.Default()
	router.GET("/search/comments", handler.SearchComments)

	req := httptest.NewRequest("GET", "/search/comments?q=typescript", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	comments := response["comments"].([]interface{})
	assert.GreaterOrEqual(t, len(comments), 1, "Should find the typescript comment")
}

func TestSearchUsers(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test user
	userRepo := models.NewUserRepository(db.Pool)
	bioText := "Software engineer interested in machine learning"
	user := &models.User{
		Username:     uniqueSearchName("mlexpert"),
		PasswordHash: "test_hash",
		Bio:          &bioText,
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create request
	router := gin.Default()
	router.GET("/search/users", handler.SearchUsers)

	req := httptest.NewRequest("GET", "/search/users?q=machine+learning", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	users := response["users"].([]interface{})
	assert.GreaterOrEqual(t, len(users), 1, "Should find user with machine learning in bio")
}

func TestSearchHubs(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueSearchName("creator"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create test hub
	hubRepo := models.NewHubRepository(db.Pool)
	description := "A community for discussing artificial intelligence and deep learning"
	hub := &models.Hub{
		Name:        uniqueSearchName("ai_enthusiasts"),
		Description: &description,
		CreatedBy:   &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Create request
	router := gin.Default()
	router.GET("/search/hubs", handler.SearchHubs)

	req := httptest.NewRequest("GET", "/search/hubs?q=artificial+intelligence", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	hubs := response["hubs"].([]interface{})
	assert.GreaterOrEqual(t, len(hubs), 1, "Should find hub with AI in description")
}

func TestSearchMissingQuery(t *testing.T) {
	handler, _, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/search/posts", handler.SearchPosts)

	req := httptest.NewRequest("GET", "/search/posts", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestSearchPagination(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test user and hub
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueSearchName("author"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      uniqueSearchName("test_hub"),
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Create multiple posts
	postRepo := models.NewPlatformPostRepository(db.Pool)
	for i := 0; i < 5; i++ {
		bodyText := "Test programming content"
		post := &models.PlatformPost{
			AuthorID: user.ID,
			HubID:    &hub.ID,
			Title:    "Programming Post",
			Body:     &bodyText,
		}
		err = postRepo.Create(ctx, post)
		require.NoError(t, err)
	}

	// Test pagination
	router := gin.Default()
	router.GET("/search/posts", handler.SearchPosts)

	req := httptest.NewRequest("GET", "/search/posts?q=programming&limit=2&offset=0", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	limit := int(response["limit"].(float64))
	offset := int(response["offset"].(float64))
	assert.Equal(t, 2, limit)
	assert.Equal(t, 0, offset)
}

func TestSearchMessagesRequiresAuth(t *testing.T) {
	handler, _, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/search/messages", handler.SearchMessages)

	req := httptest.NewRequest("GET", "/search/messages?q=test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestSearchMessagesFindsVisibleMessages(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)

	user1 := &models.User{Username: uniqueSearchName("msg_search_user1"), PasswordHash: "hash"}
	user2 := &models.User{Username: uniqueSearchName("msg_search_user2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, user2))

	conversation, err := conversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	msg := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "hello-search-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, msg))

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user1.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?q=hello-search-token", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, float64(1), response["total"])
	messages := response["messages"].([]interface{})
	assert.Len(t, messages, 1)
	first := messages[0].(map[string]interface{})
	assert.Equal(t, user2.Username, first["sender_username"])
}

func TestSearchMessagesArchivedFilter(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)

	user1 := &models.User{Username: uniqueSearchName("msg_archived_user1"), PasswordHash: "hash"}
	user2 := &models.User{Username: uniqueSearchName("msg_archived_user2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, user2))

	conversation, err := conversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	msg := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "archived-message-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, msg))

	_, err = db.Pool.Exec(ctx, `
		UPDATE conversations
		SET archived_for_user1 = TRUE
		WHERE id = $1
	`, conversation.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user1.ID)
		handler.SearchMessages(c)
	})

	reqWithoutArchived := httptest.NewRequest("GET", "/search/messages?q=archived-message-token", nil)
	wWithoutArchived := httptest.NewRecorder()
	router.ServeHTTP(wWithoutArchived, reqWithoutArchived)
	require.Equal(t, http.StatusOK, wWithoutArchived.Code, "body=%s", wWithoutArchived.Body.String())

	var withoutArchived map[string]interface{}
	require.NoError(t, json.Unmarshal(wWithoutArchived.Body.Bytes(), &withoutArchived))
	assert.Equal(t, float64(0), withoutArchived["total"])

	reqWithArchived := httptest.NewRequest("GET", "/search/messages?q=archived-message-token&include_archived=true", nil)
	wWithArchived := httptest.NewRecorder()
	router.ServeHTTP(wWithArchived, reqWithArchived)
	require.Equal(t, http.StatusOK, wWithArchived.Code, "body=%s", wWithArchived.Body.String())

	var withArchived map[string]interface{}
	require.NoError(t, json.Unmarshal(wWithArchived.Body.Bytes(), &withArchived))
	assert.Equal(t, float64(1), withArchived["total"])
}

func TestSearchMessagesInvalidDate(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: uniqueSearchName("msg_invalid_date"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user))

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?start_date=not-a-date", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestSearchMessagesInvalidConversationID(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: uniqueSearchName("msg_invalid_conv_id"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user))

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?conversation_id=abc", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid conversation_id")
}

func TestSearchMessagesInvalidSenderID(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: uniqueSearchName("msg_invalid_sender_id"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user))

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?sender_id=-5", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Invalid sender_id")
}

func TestSearchMessagesHasFilesFilter(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)

	user1 := &models.User{Username: uniqueSearchName("msg_files_user1"), PasswordHash: "hash"}
	user2 := &models.User{Username: uniqueSearchName("msg_files_user2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, user2))

	conversation, err := conversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	withFile := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "msg-with-file",
		MessageType:       "image",
		EncryptionVersion: "v1",
		MediaURL:          strPtrSearch("/uploads/test.png"),
	}
	withoutFile := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "msg-without-file",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, withFile))
	require.NoError(t, messageRepo.Create(ctx, withoutFile))

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user1.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?has_files=true", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, float64(1), response["total"])
}

func TestSearchMessagesExcludesDeletedConversationsForUser(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)

	user1 := &models.User{Username: uniqueSearchName("msg_deleted_conv_user1"), PasswordHash: "hash"}
	user2 := &models.User{Username: uniqueSearchName("msg_deleted_conv_user2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, user2))

	conversation, err := conversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	msg := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "deleted-conversation-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, msg))

	_, err = db.Pool.Exec(ctx, `
		UPDATE conversations
		SET deleted_for_user1 = TRUE
		WHERE id = $1
	`, conversation.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user1.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?q=deleted-conversation-token", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, float64(0), response["total"])
}

func TestSearchMessagesSortOld(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)

	user1 := &models.User{Username: uniqueSearchName("msg_sort_old_user1"), PasswordHash: "hash"}
	user2 := &models.User{Username: uniqueSearchName("msg_sort_old_user2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, user2))

	conversation, err := conversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	older := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "sort-token-older",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	newer := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "sort-token-newer",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, older))
	require.NoError(t, messageRepo.Create(ctx, newer))

	_, err = db.Pool.Exec(ctx, `UPDATE messages SET sent_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, older.ID)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `UPDATE messages SET sent_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, newer.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user1.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?q=sort-token&sort=old", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, "old", response["sort"])
	messages := response["messages"].([]interface{})
	require.Len(t, messages, 2)
	first := messages[0].(map[string]interface{})
	require.Equal(t, float64(older.ID), first["id"])
}

func TestSearchMessagesInvalidSortFallsBackToRelevance(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)

	user1 := &models.User{Username: uniqueSearchName("msg_sort_fallback_user1"), PasswordHash: "hash"}
	user2 := &models.User{Username: uniqueSearchName("msg_sort_fallback_user2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, user2))

	conversation, err := conversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	msg := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "fallback-sort-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, msg))

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user1.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?q=fallback-sort-token&sort=not-real", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, "relevance", response["sort"])
}

func TestSearchMessagesRelevanceAppliesRecencyBoost(t *testing.T) {
	handler, db, cleanup := setupSearchHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)

	user1 := &models.User{Username: uniqueSearchName("msg_relevance_boost_user1"), PasswordHash: "hash"}
	senderOld := &models.User{Username: uniqueSearchName("boost-token-old"), PasswordHash: "hash"}
	senderNew := &models.User{Username: uniqueSearchName("boost-token-new"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	require.NoError(t, userRepo.Create(ctx, senderOld))
	require.NoError(t, userRepo.Create(ctx, senderNew))

	convOld, err := conversationRepo.Create(ctx, user1.ID, senderOld.ID)
	require.NoError(t, err)
	convNew, err := conversationRepo.Create(ctx, user1.ID, senderNew.ID)
	require.NoError(t, err)

	oldMsg := &models.Message{
		ConversationID:    convOld.ID,
		SenderID:          senderOld.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "plain message old",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	newMsg := &models.Message{
		ConversationID:    convNew.ID,
		SenderID:          senderNew.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "plain message new",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, messageRepo.Create(ctx, oldMsg))
	require.NoError(t, messageRepo.Create(ctx, newMsg))

	_, err = db.Pool.Exec(ctx, `UPDATE messages SET sent_at = NOW() - INTERVAL '10 days' WHERE id = $1`, oldMsg.ID)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `UPDATE messages SET sent_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, newMsg.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/search/messages", func(c *gin.Context) {
		c.Set("user_id", user1.ID)
		handler.SearchMessages(c)
	})

	req := httptest.NewRequest("GET", "/search/messages?q=boost-token&sort=relevance", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, "relevance", response["sort"])
	messages := response["messages"].([]interface{})
	require.Len(t, messages, 2)
	first := messages[0].(map[string]interface{})
	require.Equal(t, float64(newMsg.ID), first["id"])
}

func strPtrSearch(value string) *string {
	return &value
}
