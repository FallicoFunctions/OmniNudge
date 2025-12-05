package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupPostsCreateTest(t *testing.T) (*PostsHandler, *models.HubRepository, *models.PlatformPostRepository, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	userRepo := models.NewUserRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	feedRepo := models.NewFeedRepository(db.Pool)

	handler := NewPostsHandler(postRepo, hubRepo, userRepo, modRepo, feedRepo)

	cleanup := func() {
		db.Close()
	}

	return handler, hubRepo, postRepo, cleanup
}

func TestCreatePost_ToHub_Success(t *testing.T) {
	handler, hubRepo, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create a test hub
	hub := &models.Hub{
		Name:           "testhub",
		ContentOptions: "any",
		CreatedBy:      ptrInt(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Get hub ID
	fetchedHub, err := hubRepo.GetByName(ctx, "testhub")
	require.NoError(t, err)

	payload := map[string]interface{}{
		"title":                 "Test Post",
		"body":                  "Test body content",
		"hub_id":                fetchedHub.ID,
		"send_replies_to_inbox": true,
		"post_type":             "text",
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts", authMiddleware(1), handler.CreatePost)

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Test Post", response["title"])
}

func TestCreatePost_ToSubreddit_Success(t *testing.T) {
	handler, _, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	payload := map[string]interface{}{
		"title":                 "Test Reddit Post",
		"body":                  "Posting to Reddit",
		"target_subreddit":      "cats",
		"send_replies_to_inbox": true,
		"post_type":             "text",
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts", authMiddleware(1), handler.CreatePost)

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Test Reddit Post", response["title"])
	assert.Equal(t, "cats", response["target_subreddit"])
}

func TestCreatePost_NoDestination_Fails(t *testing.T) {
	handler, _, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	payload := map[string]interface{}{
		"title":                 "Test Post",
		"body":                  "No destination",
		"send_replies_to_inbox": true,
		"post_type":             "text",
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts", authMiddleware(1), handler.CreatePost)

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "hub_id or target_subreddit")
}

func TestCreatePost_LinksOnlyHub_RejectsTextPost(t *testing.T) {
	handler, hubRepo, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create a links_only hub
	hub := &models.Hub{
		Name:           "linkshub",
		ContentOptions: "links_only",
		CreatedBy:      ptrInt(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Get hub ID
	fetchedHub, err := hubRepo.GetByName(ctx, "linkshub")
	require.NoError(t, err)

	// Try to create text post - should fail
	payload := map[string]interface{}{
		"title":                 "Text Post",
		"body":                  "This is text",
		"hub_id":                fetchedHub.ID,
		"send_replies_to_inbox": true,
		"post_type":             "text",
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts", authMiddleware(1), handler.CreatePost)

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "link posts")
}

func TestCreatePost_TextOnlyHub_RejectsLinkPost(t *testing.T) {
	handler, hubRepo, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create a text_only hub
	hub := &models.Hub{
		Name:           "texthub",
		ContentOptions: "text_only",
		CreatedBy:      ptrInt(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Get hub ID
	fetchedHub, err := hubRepo.GetByName(ctx, "texthub")
	require.NoError(t, err)

	// Try to create link post - should fail
	payload := map[string]interface{}{
		"title":                 "Link Post",
		"media_url":             "https://example.com/image.jpg",
		"hub_id":                fetchedHub.ID,
		"send_replies_to_inbox": true,
		"post_type":             "link",
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts", authMiddleware(1), handler.CreatePost)

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "text posts")
}

func TestCreatePost_AnyHub_AcceptsBothTypes(t *testing.T) {
	handler, hubRepo, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create an 'any' content options hub
	hub := &models.Hub{
		Name:           "anyhub",
		ContentOptions: "any",
		CreatedBy:      ptrInt(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Get hub ID
	fetchedHub, err := hubRepo.GetByName(ctx, "anyhub")
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/posts", authMiddleware(1), handler.CreatePost)

	// Test text post - should succeed
	textPayload := map[string]interface{}{
		"title":                 "Text Post",
		"body":                  "Text content",
		"hub_id":                fetchedHub.ID,
		"send_replies_to_inbox": true,
		"post_type":             "text",
	}

	body, _ := json.Marshal(textPayload)
	req := httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)

	// Test link post - should succeed
	linkPayload := map[string]interface{}{
		"title":                 "Link Post",
		"media_url":             "https://example.com/image.jpg",
		"hub_id":                fetchedHub.ID,
		"send_replies_to_inbox": true,
		"post_type":             "link",
	}

	body, _ = json.Marshal(linkPayload)
	req = httptest.NewRequest(http.MethodPost, "/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
}

// Helper functions
func authMiddleware(userID int) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Set("username", "testuser")
		c.Next()
	}
}

func ptrInt(i int) *int {
	return &i
}
