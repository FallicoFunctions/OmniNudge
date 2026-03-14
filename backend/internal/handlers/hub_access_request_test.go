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
	"github.com/omninudge/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var hubAccessCounter int64

func uniqueHubAccessName(base string) string {
	id := atomic.AddInt64(&hubAccessCounter, 1)
	return fmt.Sprintf("%s_acc_%d_%d", base, time.Now().UnixNano(), id)
}

type hubAccessTestFixture struct {
	handler  *AccessRequestHandler
	hubName  string
	hubID    int
	ownerID  int
	userID   int
	userID2  int
	cleanup  func()
}

func setupHubAccessRequestTest(t *testing.T) *hubAccessTestFixture {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: uniqueHubAccessName("owner"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, owner))
	user1 := &models.User{Username: uniqueHubAccessName("user1"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user1))
	user2 := &models.User{Username: uniqueHubAccessName("user2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user2))

	hubRepo := models.NewHubRepository(db.Pool)
	hubName := uniqueHubAccessName("hub")
	hub := &models.Hub{
		Name:           hubName,
		NameNormalized: hubName,
		Type:           "private",
		ContentOptions: "any",
		CreatedBy:      &owner.ID,
	}
	require.NoError(t, hubRepo.Create(ctx, hub))
	createdHub, err := hubRepo.GetByName(ctx, hubName)
	require.NoError(t, err)

	settingsRepo := repository.NewHubSettingsRepository(db.Pool)
	require.NoError(t, settingsRepo.AddModerator(ctx, createdHub.ID, owner.ID, models.ModeratorRoleOwner))

	// Create hub settings with privacy_type=private
	allowText, allowLink, allowImage, allowVideo := mapContentOptions(hub.ContentOptions)
	defaults := buildDefaultHubSettings(createdHub.ID, hub.Type, allowText, allowLink, allowImage, allowVideo)
	defaults.PrivacyType = "private"
	_ = settingsRepo.EnsureDefaults(ctx, defaults, &owner.ID)

	accessReqRepo := repository.NewPostgresHubAccessRequestRepository(db.Pool)
	handler := NewAccessRequestHandler(accessReqRepo, hubRepo, settingsRepo, userRepo)

	return &hubAccessTestFixture{
		handler: handler,
		hubName: hubName,
		hubID:   createdHub.ID,
		ownerID: owner.ID,
		userID:  user1.ID,
		userID2: user2.ID,
		cleanup: func() { db.Close() },
	}
}

func TestRequestHubAccess(t *testing.T) {
	f := setupHubAccessRequestTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/access-request", func(c *gin.Context) {
		c.Set("user_id", f.userID)
		f.handler.CreateRequest(c)
	})

	body, _ := json.Marshal(map[string]string{"message": "Please let me in"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/access-request", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
}

func TestRequestHubAccess_AlreadyPending(t *testing.T) {
	f := setupHubAccessRequestTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/hubs/:name/access-request", func(c *gin.Context) {
		c.Set("user_id", f.userID)
		f.handler.CreateRequest(c)
	})

	body, _ := json.Marshal(map[string]string{"message": "First request"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/access-request", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	// Second request should conflict
	body2, _ := json.Marshal(map[string]string{"message": "Duplicate request"})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/access-request", bytes.NewBuffer(body2))
	req2.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusConflict, w2.Code)
}

func TestGetAccessRequests(t *testing.T) {
	f := setupHubAccessRequestTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/mod/hubs/:hub_name/access-requests", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.GetPendingRequests(c)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/mod/hubs/"+f.hubName+"/access-requests", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp, "requests")
}

func TestApproveAccessRequest(t *testing.T) {
	f := setupHubAccessRequestTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)

	// Create an access request
	createRouter := gin.New()
	createRouter.POST("/hubs/:name/access-request", func(c *gin.Context) {
		c.Set("user_id", f.userID)
		f.handler.CreateRequest(c)
	})
	body, _ := json.Marshal(map[string]interface{}{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/access-request", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	createRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var createResp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &createResp))
	requestData, ok := createResp["request"].(map[string]interface{})
	require.True(t, ok, "response must contain a 'request' object, got: %s", w.Body.String())
	requestIDFloat, ok := requestData["id"].(float64)
	require.True(t, ok, "'request.id' must be a numeric field, got: %v", requestData["id"])
	requestID := int(requestIDFloat)

	// Approve it
	approveRouter := gin.New()
	approveRouter.POST("/access-requests/:request_id/approve", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.ApproveRequest(c)
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/access-requests/%d/approve", requestID), nil)
	approveRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
}

func TestDenyAccessRequest(t *testing.T) {
	f := setupHubAccessRequestTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)

	// Create an access request with user2
	createRouter := gin.New()
	createRouter.POST("/hubs/:name/access-request", func(c *gin.Context) {
		c.Set("user_id", f.userID2)
		f.handler.CreateRequest(c)
	})
	body, _ := json.Marshal(map[string]interface{}{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/hubs/"+f.hubName+"/access-request", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	createRouter.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var createResp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &createResp))
	requestData, ok := createResp["request"].(map[string]interface{})
	require.True(t, ok, "response must contain a 'request' object, got: %s", w.Body.String())
	requestIDFloat, ok := requestData["id"].(float64)
	require.True(t, ok, "'request.id' must be a numeric field, got: %v", requestData["id"])
	requestID := int(requestIDFloat)

	// Deny it
	denyRouter := gin.New()
	denyRouter.POST("/access-requests/:request_id/deny", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.DenyRequest(c)
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/access-requests/%d/deny", requestID), nil)
	denyRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
}
