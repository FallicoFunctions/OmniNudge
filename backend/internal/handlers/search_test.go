package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupSearchHandlerTest(t *testing.T) (*SearchHandler, *database.Database, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
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
		Username:     "author",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      "test_hub",
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	bodyText := "This post contains golang programming content"
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    hub.ID,
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
	assert.Equal(t, http.StatusOK, w.Code)

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
		Username:     "commenter",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      "test_hub",
		CreatedBy: &user.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	post := &models.PlatformPost{
		AuthorID: user.ID,
		HubID:    hub.ID,
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
	assert.Equal(t, http.StatusOK, w.Code)

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
		Username:     "mlexpert",
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
	assert.Equal(t, http.StatusOK, w.Code)

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
		Username:     "creator",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	// Create test hub
	hubRepo := models.NewHubRepository(db.Pool)
	description := "A community for discussing artificial intelligence and deep learning"
	hub := &models.Hub{
		Name:        "ai_enthusiasts",
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
	assert.Equal(t, http.StatusOK, w.Code)

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
		Username:     "author",
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      "test_hub",
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
			HubID:    hub.ID,
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
