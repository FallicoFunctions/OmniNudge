package handlers

import (
	"bytes"
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

func setupBlockingHandlerTest(t *testing.T) (*BlockingHandler, *database.Database, int, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Create test users
	userRepo := models.NewUserRepository(db.Pool)
	blocker := &models.User{
		Username:     "blocker",
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, blocker)
	require.NoError(t, err)

	blocked := &models.User{
		Username:     "blocked_user",
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, blocked)
	require.NoError(t, err)

	handler := NewBlockingHandler(db.Pool, userRepo)

	cleanup := func() {
		db.Close()
	}

	return handler, db, blocker.ID, blocked.ID, cleanup
}

func TestBlockUser(t *testing.T) {
	handler, _, blockerID, _, cleanup := setupBlockingHandlerTest(t)
	defer cleanup()

	// Create request
	router := gin.Default()
	router.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.BlockUser(c)
	})

	reqBody := map[string]string{"username": "blocked_user"}
	jsonBody, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/block", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["message"], "blocked successfully")
}

func TestBlockSelf(t *testing.T) {
	handler, _, blockerID, _, cleanup := setupBlockingHandlerTest(t)
	defer cleanup()

	// Create request to block self
	router := gin.Default()
	router.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.BlockUser(c)
	})

	reqBody := map[string]string{"username": "blocker"}
	jsonBody, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/block", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response - should fail
	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "Cannot block yourself")
}

func TestUnblockUser(t *testing.T) {
	handler, db, blockerID, blockedID, cleanup := setupBlockingHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// First block the user
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, blockerID, blockedID)
	require.NoError(t, err)

	// Create request to unblock
	router := gin.Default()
	router.DELETE("/block/:username", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.UnblockUser(c)
	})

	req := httptest.NewRequest("DELETE", "/block/blocked_user", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["message"], "unblocked successfully")
}

func TestUnblockNonBlockedUser(t *testing.T) {
	handler, _, blockerID, _, cleanup := setupBlockingHandlerTest(t)
	defer cleanup()

	// Create request to unblock user that was never blocked
	router := gin.Default()
	router.DELETE("/block/:username", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.UnblockUser(c)
	})

	req := httptest.NewRequest("DELETE", "/block/blocked_user", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusNotFound, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "was not blocked")
}

func TestGetBlockedUsers(t *testing.T) {
	handler, db, blockerID, blockedID, cleanup := setupBlockingHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// Block multiple users
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, blockerID, blockedID)
	require.NoError(t, err)

	// Create another blocked user
	userRepo := models.NewUserRepository(db.Pool)
	anotherBlocked := &models.User{
		Username:     "another_blocked",
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, anotherBlocked)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, blockerID, anotherBlocked.ID)
	require.NoError(t, err)

	// Create request
	router := gin.Default()
	router.GET("/blocked", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.GetBlockedUsers(c)
	})

	req := httptest.NewRequest("GET", "/blocked", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	blockedUsers := response["blocked_users"].([]interface{})
	assert.Len(t, blockedUsers, 2)
}

func TestBlockUserIdempotence(t *testing.T) {
	handler, db, blockerID, blockedID, cleanup := setupBlockingHandlerTest(t)
	defer cleanup()

	ctx := context.Background()

	// Block user first time
	router := gin.Default()
	router.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.BlockUser(c)
	})

	reqBody := map[string]string{"username": "blocked_user"}
	jsonBody, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/block", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Block same user again
	req = httptest.NewRequest("POST", "/block", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify only one block exists
	var count int
	err := db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM blocked_users
		WHERE blocker_id = $1 AND blocked_id = $2
	`, blockerID, blockedID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count, "Should only have one block entry")
}
