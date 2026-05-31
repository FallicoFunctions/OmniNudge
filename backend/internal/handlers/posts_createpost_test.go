package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	linkpreviewsvc "github.com/omninudge/backend/internal/services/linkpreview"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubLinkPreviewService struct {
	meta  *linkpreviewsvc.PreviewMetadata
	err   error
	calls int
}

func (s *stubLinkPreviewService) Extract(_ context.Context, _ string) (*linkpreviewsvc.PreviewMetadata, error) {
	s.calls++
	return s.meta, s.err
}

func setupPostsCreateTest(t *testing.T) (*PostsHandler, *models.HubRepository, *models.PlatformPostRepository, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	userRepo := models.NewUserRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	feedRepo := models.NewFeedRepository(db.Pool)

	testUser := &models.User{
		Username:     fmt.Sprintf("post_creator_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, testUser)
	require.NoError(t, err)

	handler := NewPostsHandler(db.Pool, postRepo, hubRepo, userRepo, modRepo, feedRepo, nil)

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
	handler, hubRepo, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create a hub to attach the platform post to.
	hub := &models.Hub{
		Name:           "subreddithub",
		ContentOptions: "any",
		CreatedBy:      ptrInt(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	fetchedHub, err := hubRepo.GetByName(ctx, "subreddithub")
	require.NoError(t, err)
	require.NotNil(t, fetchedHub)

	payload := map[string]interface{}{
		"title":                 "Test Reddit Post",
		"body":                  "Posting to Reddit",
		"hub_id":                fetchedHub.ID,
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
	err = json.Unmarshal(w.Body.Bytes(), &response)
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
	assert.Contains(t, response["error"], "hub_id is required")
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

func TestCreatePost_LinkPostEnrichesPreviewMetadata(t *testing.T) {
	handler, hubRepo, postRepo, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()
	hub := &models.Hub{
		Name:           "previewhub",
		ContentOptions: "any",
		CreatedBy:      ptrInt(1),
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	fetchedHub, err := hubRepo.GetByName(ctx, "previewhub")
	require.NoError(t, err)

	handler.SetLinkPreviewService(&stubLinkPreviewService{
		meta: &linkpreviewsvc.PreviewMetadata{
			Title:        "OG Title",
			Description:  "OG Description",
			SiteName:     "Example",
			ThumbnailURL: "https://cdn.example.com/link-preview.jpg",
		},
	})

	payload := map[string]interface{}{
		"title":                 "Link Post",
		"media_url":             "https://example.com/article",
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
	assert.Equal(t, http.StatusCreated, w.Code)

	var response models.PlatformPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.NotNil(t, response.MediaType)
	require.Equal(t, "link", *response.MediaType)
	require.NotNil(t, response.ThumbnailURL)
	require.Equal(t, "https://cdn.example.com/link-preview.jpg", *response.ThumbnailURL)
	require.NotNil(t, response.LinkPreviewSiteName)
	require.Equal(t, "Example", *response.LinkPreviewSiteName)

	storedPost, err := postRepo.GetByID(ctx, response.ID)
	require.NoError(t, err)
	require.NotNil(t, storedPost)
	require.NotNil(t, storedPost.LinkPreviewTitle)
	require.Equal(t, "OG Title", *storedPost.LinkPreviewTitle)
	require.NotNil(t, storedPost.LinkPreviewDescription)
	require.Equal(t, "OG Description", *storedPost.LinkPreviewDescription)
}

func TestCreatePost_KnownEmbedProviderSkipsLinkPreviewExtraction(t *testing.T) {
	handler, hubRepo, _, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()
	hub := &models.Hub{
		Name:           "embedhub",
		ContentOptions: "any",
		CreatedBy:      ptrInt(1),
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	fetchedHub, err := hubRepo.GetByName(ctx, "embedhub")
	require.NoError(t, err)

	stubPreview := &stubLinkPreviewService{
		meta: &linkpreviewsvc.PreviewMetadata{
			Title:        "Should not be used",
			ThumbnailURL: "https://cdn.example.com/unused.jpg",
		},
	}
	handler.SetLinkPreviewService(stubPreview)

	payload := map[string]interface{}{
		"title":                 "Video Post",
		"media_url":             "https://youtu.be/dQw4w9WgXcQ",
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
	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Equal(t, 0, stubPreview.calls)

	var response models.PlatformPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Nil(t, response.LinkPreviewTitle)
	require.Nil(t, response.LinkPreviewSiteName)
}

func TestUpdatePost_LinkPostMediaChangeRefreshesPreviewMetadata(t *testing.T) {
	handler, hubRepo, postRepo, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()
	hub := &models.Hub{
		Name:           fmt.Sprintf("updatehub_%d", time.Now().UnixNano()),
		ContentOptions: "any",
		CreatedBy:      ptrInt(1),
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	fetchedHub, err := hubRepo.GetByName(ctx, hub.Name)
	require.NoError(t, err)

	oldMediaURL := "https://example.com/original-article"
	oldMediaType := "link"
	oldThumbnailURL := "/uploads/original-thumb.jpg"
	oldPreviewTitle := "Original preview title"
	oldPreviewDescription := "Original preview description"
	oldPreviewSiteName := "Original Site"

	post := &models.PlatformPost{
		AuthorID:               1,
		HubID:                  &fetchedHub.ID,
		Title:                  "Existing link post",
		MediaURL:               &oldMediaURL,
		MediaType:              &oldMediaType,
		ThumbnailURL:           &oldThumbnailURL,
		LinkPreviewTitle:       &oldPreviewTitle,
		LinkPreviewDescription: &oldPreviewDescription,
		LinkPreviewSiteName:    &oldPreviewSiteName,
	}
	require.NoError(t, postRepo.Create(ctx, post))

	stubPreview := &stubLinkPreviewService{
		meta: &linkpreviewsvc.PreviewMetadata{
			Title:        "Updated preview title",
			Description:  "Updated preview description",
			SiteName:     "Updated Site",
			ThumbnailURL: "/uploads/updated-thumb.jpg",
		},
	}
	handler.SetLinkPreviewService(stubPreview)

	payload := map[string]interface{}{
		"title":         "Existing link post",
		"media_url":     "https://example.com/updated-article",
		"media_type":    "link",
		"thumbnail_url": "/uploads/client-thumb-should-be-overridden.jpg",
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/posts/%d", post.ID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/posts/:id", authMiddleware(1), handler.UpdatePost)

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, 1, stubPreview.calls)

	updatedPost, err := postRepo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	require.NotNil(t, updatedPost)
	require.NotNil(t, updatedPost.MediaURL)
	require.Equal(t, "https://example.com/updated-article", *updatedPost.MediaURL)
	require.NotNil(t, updatedPost.MediaType)
	require.Equal(t, "link", *updatedPost.MediaType)
	require.NotNil(t, updatedPost.ThumbnailURL)
	require.Equal(t, "/uploads/updated-thumb.jpg", *updatedPost.ThumbnailURL)
	require.NotNil(t, updatedPost.LinkPreviewTitle)
	require.Equal(t, "Updated preview title", *updatedPost.LinkPreviewTitle)
	require.NotNil(t, updatedPost.LinkPreviewDescription)
	require.Equal(t, "Updated preview description", *updatedPost.LinkPreviewDescription)
	require.NotNil(t, updatedPost.LinkPreviewSiteName)
	require.Equal(t, "Updated Site", *updatedPost.LinkPreviewSiteName)
}

func TestUpdatePost_NonMediaEditPreservesExistingPreviewMetadata(t *testing.T) {
	handler, hubRepo, postRepo, cleanup := setupPostsCreateTest(t)
	defer cleanup()

	ctx := context.Background()
	hub := &models.Hub{
		Name:           fmt.Sprintf("updatepreservehub_%d", time.Now().UnixNano()),
		ContentOptions: "any",
		CreatedBy:      ptrInt(1),
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	fetchedHub, err := hubRepo.GetByName(ctx, hub.Name)
	require.NoError(t, err)

	mediaURL := "https://example.com/article"
	mediaType := "link"
	thumbnailURL := "/uploads/existing-thumb.jpg"
	previewTitle := "Existing preview title"
	previewDescription := "Existing preview description"
	previewSiteName := "Existing Site"

	post := &models.PlatformPost{
		AuthorID:               1,
		HubID:                  &fetchedHub.ID,
		Title:                  "Existing post title",
		MediaURL:               &mediaURL,
		MediaType:              &mediaType,
		ThumbnailURL:           &thumbnailURL,
		LinkPreviewTitle:       &previewTitle,
		LinkPreviewDescription: &previewDescription,
		LinkPreviewSiteName:    &previewSiteName,
	}
	require.NoError(t, postRepo.Create(ctx, post))

	stubPreview := &stubLinkPreviewService{
		meta: &linkpreviewsvc.PreviewMetadata{
			Title:        "Should not be used",
			Description:  "Should not be used",
			SiteName:     "Should not be used",
			ThumbnailURL: "/uploads/should-not-be-used.jpg",
		},
	}
	handler.SetLinkPreviewService(stubPreview)

	updatedBody := "Edited body copy"
	payload := map[string]interface{}{
		"title":         "Edited title",
		"body":          updatedBody,
		"media_url":     mediaURL,
		"media_type":    mediaType,
		"thumbnail_url": thumbnailURL,
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/posts/%d", post.ID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/posts/:id", authMiddleware(1), handler.UpdatePost)

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, 0, stubPreview.calls)

	updatedPost, err := postRepo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	require.NotNil(t, updatedPost)
	require.Equal(t, "Edited title", updatedPost.Title)
	require.NotNil(t, updatedPost.Body)
	require.Equal(t, updatedBody, *updatedPost.Body)
	require.NotNil(t, updatedPost.LinkPreviewTitle)
	require.Equal(t, previewTitle, *updatedPost.LinkPreviewTitle)
	require.NotNil(t, updatedPost.LinkPreviewDescription)
	require.Equal(t, previewDescription, *updatedPost.LinkPreviewDescription)
	require.NotNil(t, updatedPost.LinkPreviewSiteName)
	require.Equal(t, previewSiteName, *updatedPost.LinkPreviewSiteName)
	require.NotNil(t, updatedPost.ThumbnailURL)
	require.Equal(t, thumbnailURL, *updatedPost.ThumbnailURL)
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
