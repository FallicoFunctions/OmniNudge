package handlers

import (
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

func setupSubscriptionsTest(t *testing.T) (*SubscriptionsHandler, *models.HubSubscriptionRepository, *models.SubredditSubscriptionRepository, *models.HubRepository, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	hubSubRepo := models.NewHubSubscriptionRepository(db.Pool)
	subredditSubRepo := models.NewSubredditSubscriptionRepository(db.Pool)
	hubRepo := models.NewHubRepository(db.Pool)

	handler := NewSubscriptionsHandler(hubSubRepo, subredditSubRepo, hubRepo)

	cleanup := func() {
		db.Close()
	}

	return handler, hubSubRepo, subredditSubRepo, hubRepo, cleanup
}

func TestSubscribeToHub_Success(t *testing.T) {
	handler, _, _, hubRepo, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	// Create a test hub
	ctx := context.Background()
	hub := &models.Hub{
		Name:      "testHub",
		CreatedBy: intPtr(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/subscribe", mockAuthMiddleware(1), handler.SubscribeToHub)

	req := httptest.NewRequest(http.MethodPost, "/hubs/testHub/subscribe", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.True(t, response["is_subscribed"].(bool))
	assert.Equal(t, float64(1), response["subscriber_count"].(float64))
}

func TestSubscribeToHub_HubNotFound(t *testing.T) {
	handler, _, _, _, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/subscribe", mockAuthMiddleware(1), handler.SubscribeToHub)

	req := httptest.NewRequest(http.MethodPost, "/hubs/nonexistent/subscribe", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestUnsubscribeFromHub_Success(t *testing.T) {
	handler, hubSubRepo, _, hubRepo, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	ctx := context.Background()
	hub := &models.Hub{
		Name:      "testHub",
		CreatedBy: intPtr(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Get hub ID
	fetchedHub, err := hubRepo.GetByName(ctx, "testHub")
	require.NoError(t, err)

	// Subscribe first
	err = hubSubRepo.Subscribe(ctx, 1, fetchedHub.ID)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.DELETE("/hubs/:name/unsubscribe", mockAuthMiddleware(1), handler.UnsubscribeFromHub)

	// Unsubscribe
	req := httptest.NewRequest(http.MethodDelete, "/hubs/testHub/unsubscribe", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.False(t, response["is_subscribed"].(bool))
}

func TestCheckHubSubscription_Subscribed(t *testing.T) {
	handler, hubSubRepo, _, hubRepo, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	ctx := context.Background()
	hub := &models.Hub{
		Name:      "testHub",
		CreatedBy: intPtr(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Get hub ID
	fetchedHub, err := hubRepo.GetByName(ctx, "testHub")
	require.NoError(t, err)

	// Subscribe
	err = hubSubRepo.Subscribe(ctx, 1, fetchedHub.ID)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/:name/subscription", mockAuthMiddleware(1), handler.CheckHubSubscription)

	req := httptest.NewRequest(http.MethodGet, "/hubs/testHub/subscription", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.True(t, response["is_subscribed"].(bool))
}

func TestGetUserHubSubscriptions_Success(t *testing.T) {
	handler, hubSubRepo, _, hubRepo, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create multiple hubs
	hub1 := &models.Hub{
		Name:      "hub1",
		CreatedBy: intPtr(1),
	}
	err := hubRepo.Create(ctx, hub1)
	require.NoError(t, err)

	hub2 := &models.Hub{
		Name:      "hub2",
		CreatedBy: intPtr(1),
	}
	err = hubRepo.Create(ctx, hub2)
	require.NoError(t, err)

	// Get hub IDs
	fetchedHub1, err := hubRepo.GetByName(ctx, "hub1")
	require.NoError(t, err)
	fetchedHub2, err := hubRepo.GetByName(ctx, "hub2")
	require.NoError(t, err)

	// Subscribe to both
	err = hubSubRepo.Subscribe(ctx, 1, fetchedHub1.ID)
	require.NoError(t, err)
	err = hubSubRepo.Subscribe(ctx, 1, fetchedHub2.ID)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/users/me/subscriptions/hubs", mockAuthMiddleware(1), handler.GetUserHubSubscriptions)

	req := httptest.NewRequest(http.MethodGet, "/users/me/subscriptions/hubs", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	subscriptions, ok := response["subscriptions"].([]interface{})
	require.True(t, ok)
	assert.Len(t, subscriptions, 2)
}

func TestSubscribeToSubreddit_Success(t *testing.T) {
	handler, _, _, _, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/subreddits/:name/subscribe", mockAuthMiddleware(1), handler.SubscribeToSubreddit)

	req := httptest.NewRequest(http.MethodPost, "/subreddits/cats/subscribe", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.True(t, response["is_subscribed"].(bool))
}

func TestUnsubscribeFromSubreddit_Success(t *testing.T) {
	handler, _, subredditSubRepo, _, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	ctx := context.Background()

	// Subscribe first
	err := subredditSubRepo.Subscribe(ctx, 1, "cats")
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.DELETE("/subreddits/:name/unsubscribe", mockAuthMiddleware(1), handler.UnsubscribeFromSubreddit)

	// Unsubscribe
	req := httptest.NewRequest(http.MethodDelete, "/subreddits/cats/unsubscribe", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.False(t, response["is_subscribed"].(bool))
}

func TestGetUserSubredditSubscriptions_Success(t *testing.T) {
	handler, _, subredditSubRepo, _, cleanup := setupSubscriptionsTest(t)
	defer cleanup()

	ctx := context.Background()

	// Subscribe to multiple subreddits
	err := subredditSubRepo.Subscribe(ctx, 1, "cats")
	require.NoError(t, err)
	err = subredditSubRepo.Subscribe(ctx, 1, "dogs")
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/users/me/subscriptions/subreddits", mockAuthMiddleware(1), handler.GetUserSubredditSubscriptions)

	req := httptest.NewRequest(http.MethodGet, "/users/me/subscriptions/subreddits", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	subscriptions, ok := response["subscriptions"].([]interface{})
	require.True(t, ok)
	assert.Len(t, subscriptions, 2)
}
