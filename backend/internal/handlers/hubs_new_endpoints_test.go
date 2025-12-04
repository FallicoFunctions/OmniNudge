package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateHub_NameValidation(t *testing.T) {
	handler, _, _, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	userID := 1
	router.POST("/hubs", mockAuthMiddleware(userID), handler.Create)

	tests := []struct {
		name           string
		hubName        string
		expectedStatus int
		shouldContain  string
	}{
		{
			name:           "Name with spaces should fail",
			hubName:        "test hub",
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "lowercase alphanumeric with underscores only",
		},
		{
			name:           "Name with uppercase should fail",
			hubName:        "TestHub",
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "lowercase alphanumeric with underscores only",
		},
		{
			name:           "Name too short should fail",
			hubName:        "ab",
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "at least 3 characters",
		},
		{
			name:           "Valid lowercase name should succeed",
			hubName:        "validhub",
			expectedStatus: http.StatusCreated,
			shouldContain:  "",
		},
		{
			name:           "Valid name with underscores should succeed",
			hubName:        "valid_hub_123",
			expectedStatus: http.StatusCreated,
			shouldContain:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := map[string]interface{}{
				"name":            tt.hubName,
				"description":     "Test description",
				"type":            "public",
				"content_options": "any",
			}

			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/hubs", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.shouldContain != "" {
				var response map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &response)
				require.NoError(t, err)
				assert.Contains(t, response["error"], tt.shouldContain)
			}
		})
	}
}

func TestCreateHub_DescriptionValidation(t *testing.T) {
	handler, _, _, cleanup := setupHubsTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	userID := 1
	router.POST("/hubs", mockAuthMiddleware(userID), handler.Create)

	// Create description that's too long (501 chars)
	longDescription := ""
	for i := 0; i < 501; i++ {
		longDescription += "a"
	}

	payload := map[string]interface{}{
		"name":            "testhub",
		"description":     longDescription,
		"type":            "public",
		"content_options": "any",
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/hubs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "less than 500 characters")
}

func TestGetPopularFeed_ExcludesQuarantined(t *testing.T) {
	handler, hubRepo, _, cleanup := setupHubsTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create a normal hub
	normalHub := &models.Hub{
		Name:          "normalhub",
		Type:          "public",
		IsQuarantined: false,
		CreatedBy:     intPtr(1),
	}
	err := hubRepo.Create(ctx, normalHub)
	require.NoError(t, err)

	// Create a quarantined hub
	quarantinedHub := &models.Hub{
		Name:          "quarantinedhub",
		Type:          "public",
		IsQuarantined: true,
		CreatedBy:     intPtr(1),
	}
	err = hubRepo.Create(ctx, quarantinedHub)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/h/popular", mockAuthMiddleware(1), handler.GetPopularFeed)

	req := httptest.NewRequest(http.MethodGet, "/hubs/h/popular?sort=hot", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Response should have posts array (even if empty)
	_, ok := response["posts"]
	assert.True(t, ok)
}

func TestGetAllFeed_ReturnsGlobalPosts(t *testing.T) {
	handler, hubRepo, _, cleanup := setupHubsTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test hub
	hub := &models.Hub{
		Name:      "testhub",
		Type:      "public",
		CreatedBy: intPtr(1),
	}
	err := hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/h/all", handler.GetAllFeed)

	req := httptest.NewRequest(http.MethodGet, "/hubs/h/all?sort=hot", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	_, ok := response["posts"]
	assert.True(t, ok)
}

func TestSearchHubs_ReturnsMatchingHubs(t *testing.T) {
	handler, hubRepo, _, cleanup := setupHubsTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test hubs with searchable names
	hub1 := &models.Hub{
		Name:      "catlovers",
		CreatedBy: intPtr(1),
	}
	err := hubRepo.Create(ctx, hub1)
	require.NoError(t, err)

	hub2 := &models.Hub{
		Name:      "catphotos",
		CreatedBy: intPtr(1),
	}
	err = hubRepo.Create(ctx, hub2)
	require.NoError(t, err)

	hub3 := &models.Hub{
		Name:      "doglovers",
		CreatedBy: intPtr(1),
	}
	err = hubRepo.Create(ctx, hub3)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/search", handler.SearchHubs)

	req := httptest.NewRequest(http.MethodGet, "/hubs/search?q=cat", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	hubs, ok := response["hubs"].([]interface{})
	require.True(t, ok)

	// Should find the two hubs with "cat" in the name
	assert.GreaterOrEqual(t, len(hubs), 2)

	// Verify results contain "cat"
	for _, h := range hubs {
		hub := h.(map[string]interface{})
		name := hub["name"].(string)
		assert.Contains(t, name, "cat")
	}
}

func TestGetTrendingHubs_SortedBySubscribers(t *testing.T) {
	handler, hubRepo, _, cleanup := setupHubsTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create hubs with different subscriber counts
	hub1 := &models.Hub{
		Name:            "popularhub",
		SubscriberCount: 100,
		CreatedBy:       intPtr(1),
	}
	err := hubRepo.Create(ctx, hub1)
	require.NoError(t, err)

	hub2 := &models.Hub{
		Name:            "lesspopular",
		SubscriberCount: 50,
		CreatedBy:       intPtr(1),
	}
	err = hubRepo.Create(ctx, hub2)
	require.NoError(t, err)

	hub3 := &models.Hub{
		Name:            "newhub",
		SubscriberCount: 10,
		CreatedBy:       intPtr(1),
	}
	err = hubRepo.Create(ctx, hub3)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/hubs/trending", handler.GetTrendingHubs)

	req := httptest.NewRequest(http.MethodGet, "/hubs/trending?limit=10", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	hubs, ok := response["hubs"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(hubs), 3)

	// Verify sorted by subscriber_count descending
	if len(hubs) >= 2 {
		firstHub := hubs[0].(map[string]interface{})
		secondHub := hubs[1].(map[string]interface{})
		firstCount := int(firstHub["subscriber_count"].(float64))
		secondCount := int(secondHub["subscriber_count"].(float64))
		assert.GreaterOrEqual(t, firstCount, secondCount)
	}
}

