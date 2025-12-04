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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupHubsTest creates a test setup with database and handler
func setupHubsTest(t *testing.T) (*HubsHandler, *models.HubRepository, *models.PlatformPostRepository, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Ensure a default user exists for FK constraints (tests use user ID 1)
	userRepo := models.NewUserRepository(db.Pool)
	testUser := &models.User{
		Username:     fmt.Sprintf("hubtester_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, testUser)
	require.NoError(t, err)

	hubRepo := models.NewHubRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	hubSubRepo := models.NewHubSubscriptionRepository(db.Pool)

	handler := NewHubsHandler(hubRepo, postRepo, modRepo, hubSubRepo)

	cleanup := func() {
		db.Close()
	}

	return handler, hubRepo, postRepo, cleanup
}

// Helper function to create pointer to string
func ptr(s string) *string {
	return &s
}

func TestCreateHub(t *testing.T) {
	handler, _, _, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	userID := 1
	router.POST("/hubs", mockAuthMiddleware(userID), handler.Create)

	tests := []struct {
		name           string
		requestBody    map[string]interface{}
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name: "create hub successfully",
			requestBody: map[string]interface{}{
				"name":        "my_hub",
				"description": "Test hub description",
			},
			expectedStatus: http.StatusCreated,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				hub := body["hub"].(map[string]interface{})
				assert.Equal(t, "my_hub", hub["name"])
				assert.Equal(t, "Test hub description", hub["description"])
				assert.Equal(t, float64(userID), hub["owner_id"])
			},
		},
		{
			name: "create hub without name",
			requestBody: map[string]interface{}{
				"description": "No name provided",
			},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Invalid")
			},
		},
		{
			name: "create hub with duplicate name",
			requestBody: map[string]interface{}{
				"name":        "my_hub",
				"description": "Duplicate hub",
			},
			expectedStatus: http.StatusConflict,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "already exists")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.requestBody)
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("POST", "/hubs", bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestGetHub(t *testing.T) {
	handler, hubRepo, _, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name", handler.Get)

	ctx := context.Background()
	userID := 1

	// Create a test hub
	testDesc := "Test description"
	hub := &models.Hub{
		Name:        "test_hub",
		Description: &testDesc,
		CreatedBy:   &userID,
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	tests := []struct {
		name           string
		hubName        string
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name:           "get existing hub",
			hubName:        "test_hub",
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				hub := body["hub"].(map[string]interface{})
				assert.Equal(t, "test_hub", hub["name"])
				assert.Equal(t, "Test description", hub["description"])
			},
		},
		{
			name:           "get non-existent hub",
			hubName:        "nonexistent",
			expectedStatus: http.StatusNotFound,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "not found")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", fmt.Sprintf("/hubs/%s", tt.hubName), nil)
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestGetUserHubs(t *testing.T) {
	handler, hubRepo, _, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	userID := 1
	router.GET("/hubs", mockAuthMiddleware(userID), handler.GetUserHubs)

	ctx := context.Background()

	// Create test hubs
	desc1 := "First hub"
	hub1 := &models.Hub{
		Name:        "hub1",
		Description: &desc1,
		CreatedBy:   &userID,
	}
	err := hubRepo.Create(ctx, hub1)
	require.NoError(t, err)

	desc2 := "Second hub"
	hub2 := &models.Hub{
		Name:        "hub2",
		Description: &desc2,
		CreatedBy:   &userID,
	}
	err = hubRepo.Create(ctx, hub2)
	require.NoError(t, err)

	// Create hub owned by different user
	otherUser := 999
	desc3 := "Not my hub"
	hub3 := &models.Hub{
		Name:        "other_hub",
		Description: &desc3,
		CreatedBy:   &otherUser,
	}
	err = hubRepo.Create(ctx, hub3)
	require.NoError(t, err)

	t.Run("get user's hubs", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/hubs", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		hubs := response["hubs"].([]interface{})
		assert.Len(t, hubs, 2)

		// Verify correct hubs returned
		hubNames := make([]string, len(hubs))
		for i, h := range hubs {
			hub := h.(map[string]interface{})
			hubNames[i] = hub["name"].(string)
		}
		assert.Contains(t, hubNames, "hub1")
		assert.Contains(t, hubNames, "hub2")
		assert.NotContains(t, hubNames, "other_hub")
	})
}

func TestCrosspostToHub(t *testing.T) {
	handler, hubRepo, postRepo, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	userID := 1
	router.POST("/hubs/:name/posts", mockAuthMiddleware(userID), handler.CrosspostToHub)

	ctx := context.Background()

	// Create a test hub
	hubDesc := "Test hub"
	hub := &models.Hub{
		Name:        "test_hub",
		Description: &hubDesc,
		CreatedBy:   &userID,
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	tests := []struct {
		name           string
		hubName        string
		requestBody    CrosspostRequest
		queryParams    map[string]string
		expectedStatus int
		checkResponse  func(t *testing.T, body map[string]interface{})
	}{
		{
			name:    "crosspost reddit post to hub",
			hubName: "test_hub",
			requestBody: CrosspostRequest{
				Title:              "Crossposted from Reddit",
				Body:               ptr("This is the post body"),
				MediaURL:           ptr("https://example.com/image.jpg"),
				MediaType:          ptr("image"),
				ThumbnailURL:       ptr("https://example.com/thumb.jpg"),
				SendRepliesToInbox: true,
			},
			queryParams: map[string]string{
				"origin_type":      "reddit",
				"origin_post_id":   "abc123",
				"origin_subreddit": "funny",
				"original_title":   "Original Reddit Title",
			},
			expectedStatus: http.StatusCreated,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				post := body["post"].(map[string]interface{})
				assert.Equal(t, "Crossposted from Reddit", post["title"])
				assert.Equal(t, "reddit", post["crosspost_origin_type"])
				assert.Equal(t, "funny", post["crosspost_origin_subreddit"])
				assert.Equal(t, "abc123", post["crosspost_origin_post_id"])
				assert.Equal(t, "Original Reddit Title", post["crosspost_original_title"])

				// Verify post was actually created
				posts, err := postRepo.GetByHub(ctx, hub.ID, "new", 10, 0)
				require.NoError(t, err)
				assert.Len(t, posts, 1)
			},
		},
		{
			name:    "crosspost platform post to hub",
			hubName: "test_hub",
			requestBody: CrosspostRequest{
				Title:              "Crossposted from Platform",
				Body:               ptr("Platform post body"),
				SendRepliesToInbox: true,
			},
			queryParams: map[string]string{
				"origin_type":    "platform",
				"origin_post_id": "456",
			},
			expectedStatus: http.StatusCreated,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				post := body["post"].(map[string]interface{})
				assert.Equal(t, "Crossposted from Platform", post["title"])
				assert.Equal(t, "platform", post["crosspost_origin_type"])
				assert.Equal(t, "456", post["crosspost_origin_post_id"])
			},
		},
		{
			name:    "crosspost without origin information",
			hubName: "test_hub",
			requestBody: CrosspostRequest{
				Title:              "Missing origin",
				SendRepliesToInbox: true,
			},
			queryParams:    map[string]string{},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Missing crosspost origin")
			},
		},
		{
			name:    "crosspost with invalid origin type",
			hubName: "test_hub",
			requestBody: CrosspostRequest{
				Title:              "Invalid origin",
				SendRepliesToInbox: true,
			},
			queryParams: map[string]string{
				"origin_type":    "invalid",
				"origin_post_id": "123",
			},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Invalid origin_type")
			},
		},
		{
			name:    "crosspost reddit post without subreddit",
			hubName: "test_hub",
			requestBody: CrosspostRequest{
				Title:              "Missing subreddit",
				SendRepliesToInbox: true,
			},
			queryParams: map[string]string{
				"origin_type":    "reddit",
				"origin_post_id": "xyz789",
			},
			expectedStatus: http.StatusBadRequest,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "origin_subreddit required")
			},
		},
		{
			name:    "crosspost to non-existent hub",
			hubName: "nonexistent_hub",
			requestBody: CrosspostRequest{
				Title:              "Hub not found",
				SendRepliesToInbox: true,
			},
			queryParams: map[string]string{
				"origin_type":      "reddit",
				"origin_post_id":   "abc",
				"origin_subreddit": "test",
			},
			expectedStatus: http.StatusNotFound,
			checkResponse: func(t *testing.T, body map[string]interface{}) {
				assert.Contains(t, body["error"], "Hub not found")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.requestBody)
			w := httptest.NewRecorder()

			// Build URL with query params
			url := fmt.Sprintf("/hubs/%s/posts", tt.hubName)
			if len(tt.queryParams) > 0 {
				url += "?"
				first := true
				for k, v := range tt.queryParams {
					if !first {
						url += "&"
					}
					url += fmt.Sprintf("%s=%s", k, v)
					first = false
				}
			}

			req, _ := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			if tt.checkResponse != nil {
				tt.checkResponse(t, response)
			}
		})
	}
}

func TestCrosspostToSubreddit(t *testing.T) {
	handler, _, postRepo, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	userID := 1
	router.POST("/subreddits/:name/posts", mockAuthMiddleware(userID), handler.CrosspostToSubreddit)

	ctx := context.Background()

	t.Run("crosspost to subreddit successfully", func(t *testing.T) {
		requestBody := CrosspostRequest{
			Title:              "Crossposted to subreddit",
			Body:               ptr("Post body"),
			SendRepliesToInbox: true,
		}
		bodyBytes, _ := json.Marshal(requestBody)

		w := httptest.NewRecorder()
		url := "/subreddits/funny/posts?origin_type=reddit&origin_post_id=abc123&origin_subreddit=pics"
		req, _ := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		post := response["post"].(map[string]interface{})
		assert.Equal(t, "Crossposted to subreddit", post["title"])
		assert.Equal(t, "funny", post["target_subreddit"])
		assert.Equal(t, "reddit", post["crosspost_origin_type"])

		// Verify post was actually created with target_subreddit
		posts, err := postRepo.GetBySubreddit(ctx, "funny", "new", 10, 0)
		require.NoError(t, err)
		assert.Len(t, posts, 1)
		assert.Equal(t, "funny", *posts[0].TargetSubreddit)
	})

	t.Run("crosspost to subreddit without origin info", func(t *testing.T) {
		requestBody := CrosspostRequest{
			Title:              "Missing origin",
			SendRepliesToInbox: true,
		}
		bodyBytes, _ := json.Marshal(requestBody)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/subreddits/funny/posts", bytes.NewBuffer(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestCrosspostTimestampUsesCreationTime(t *testing.T) {
	handler, _, postRepo, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	userID := 1
	router.POST("/subreddits/:name/posts", mockAuthMiddleware(userID), handler.CrosspostToSubreddit)

	reqBody := CrosspostRequest{
		Title:              "Timestamp test",
		Body:               ptr("body"),
		SendRepliesToInbox: true,
	}
	bodyBytes, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(
		"POST",
		"/subreddits/test/posts?origin_type=reddit&origin_post_id=abc123&origin_subreddit=test",
		bytes.NewReader(bodyBytes),
	)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.Code)
	}

	posts, err := postRepo.GetBySubreddit(context.Background(), "test", "new", 5, 0)
	require.NoError(t, err)
	require.NotEmpty(t, posts)

	// CreatedAt reflects when the record was persisted (original post time), but crossposted_at must reflect now.
	if posts[0].CrosspostedAt == nil {
		t.Fatalf("expected crossposted_at to be set")
	}
	crosspostedUTC := posts[0].CrosspostedAt.In(time.UTC)
	if time.Since(crosspostedUTC) > 2*time.Second {
		t.Fatalf("expected crossposted_at to be recent, got %s", posts[0].CrosspostedAt)
	}
	diff := posts[0].CreatedAt.Sub(crosspostedUTC)
	if diff < -time.Second || diff > time.Second {
		t.Fatalf("expected created_at to match crossposted_at, got created_at=%s crossposted_at=%s", posts[0].CreatedAt, posts[0].CrosspostedAt)
	}
}

func TestGetPlatformSubredditPosts(t *testing.T) {
	handler, _, postRepo, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/subreddits/:name/posts", handler.GetPosts)

	ctx := context.Background()
	userID := 1

	// Create test posts with target_subreddit
	for i := 1; i <= 3; i++ {
		body := fmt.Sprintf("Body %d", i)
		post := &models.PlatformPost{
			AuthorID:        userID,
			Title:           fmt.Sprintf("Post %d", i),
			Body:            &body,
			TargetSubreddit: ptr("funny"),
		}
		err := postRepo.Create(ctx, post)
		require.NoError(t, err)
	}

	// Create post for different subreddit
	otherBody := "Other body"
	otherPost := &models.PlatformPost{
		AuthorID:        userID,
		Title:           "Other post",
		Body:            &otherBody,
		TargetSubreddit: ptr("pics"),
	}
	err := postRepo.Create(ctx, otherPost)
	require.NoError(t, err)

	t.Run("get posts for subreddit", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/subreddits/funny/posts", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		posts := response["posts"].([]interface{})
		assert.Len(t, posts, 3)

		// Verify correct posts returned
		for _, p := range posts {
			post := p.(map[string]interface{})
			assert.Equal(t, "funny", post["target_subreddit"])
		}
	})

	t.Run("get posts with sorting", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/subreddits/funny/posts?sort=new", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestHubAuthRequired(t *testing.T) {
	handler, _, _, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()

	// Routes without auth middleware
	router.POST("/hubs", handler.Create)
	router.GET("/user-hubs", handler.GetUserHubs)

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"create hub", "POST", "/hubs", `{"name":"test","description":"test"}`},
		{"get user hubs", "GET", "/user-hubs", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name+" requires auth", func(t *testing.T) {
			w := httptest.NewRecorder()
			var req *http.Request
			if tt.body != "" {
				req, _ = http.NewRequest(tt.method, tt.path, bytes.NewBufferString(tt.body))
				req.Header.Set("Content-Type", "application/json")
			} else {
				req, _ = http.NewRequest(tt.method, tt.path, nil)
			}
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusUnauthorized, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)
			assert.Contains(t, response["error"], "not authenticated")
		})
	}
}
