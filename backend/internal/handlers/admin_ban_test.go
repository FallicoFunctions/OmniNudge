package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAdminBanTestEnv(t *testing.T) (*gin.Engine, *models.UserRepository, *pgxpool.Pool, func()) {
	gin.SetMode(gin.TestMode)

	// Set up encryption key for tests
	testKey := "12345678901234567890123456789012"
	err := utils.SetEncryptionKey(testKey)
	require.NoError(t, err)

	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	// Ensure the test DB schema exists and is up-to-date, and avoid cross-package races.
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	pool := db.Pool

	userRepo := models.NewUserRepository(pool)
	hubModRepo := models.NewHubModeratorRepository(pool)
	handler := NewAdminHandler(userRepo, hubModRepo, pool)

	router := gin.New()

	// Middleware to set user_id from header for testing
	router.Use(func(c *gin.Context) {
		if userID := c.GetHeader("X-Test-User-ID"); userID != "" {
			if id, err := strconv.Atoi(userID); err == nil {
				c.Set("user_id", id)
			}
		}
		c.Next()
	})

	adminRoutes := router.Group("/api/v1/admin")
	{
		adminRoutes.POST("/users/:id/ban", handler.BanUser)
		adminRoutes.POST("/users/:id/shadow-ban", handler.ShadowBanUser)
		adminRoutes.POST("/users/:id/unban", handler.UnbanUser)
		adminRoutes.POST("/users/:id/delete", handler.SoftDeleteUser)
		adminRoutes.GET("/users/:id/ban-history", handler.GetBanHistory)
		adminRoutes.GET("/ban-history", handler.GetAllBanHistory)
	}

	cleanup := func() {
		_ = database.ResetTestData(ctx, db)
	}

	return router, userRepo, pool, cleanup
}

func createAdminBanTestUser(t *testing.T, repo *models.UserRepository, username string) *models.User {
	ctx := context.Background()
	user := &models.User{
		Username:     username,
		PasswordHash: "test-hash",
		Role:         "user",
	}
	err := repo.Create(ctx, user)
	require.NoError(t, err)
	return user
}

func TestBanUserHandler(t *testing.T) {
	router, userRepo, pool, cleanup := setupAdminBanTestEnv(t)
	defer cleanup()

	admin := createAdminBanTestUser(t, userRepo, "adminbantest_admin")
	targetUser := createAdminBanTestUser(t, userRepo, "adminbantest_target")

	t.Run("successful ban", func(t *testing.T) {
		var beforeTokenVersion int
		require.NoError(t, pool.QueryRow(context.Background(), "SELECT token_version FROM users WHERE id = $1", targetUser.ID).Scan(&beforeTokenVersion))

		payload := map[string]interface{}{
			"reason":      "Spam posting",
			"show_reason": true,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/v1/admin/users/"+strconv.Itoa(targetUser.ID)+"/ban", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", strconv.Itoa(admin.ID))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, "User banned", response["message"])

		// Verify in database
		var banned bool
		err = pool.QueryRow(context.Background(), "SELECT banned FROM users WHERE id = $1", targetUser.ID).Scan(&banned)
		require.NoError(t, err)
		assert.True(t, banned)

		var afterTokenVersion int
		err = pool.QueryRow(context.Background(), "SELECT token_version FROM users WHERE id = $1", targetUser.ID).Scan(&afterTokenVersion)
		require.NoError(t, err)
		assert.Equal(t, beforeTokenVersion+1, afterTokenVersion)
	})

	t.Run("ban without reason", func(t *testing.T) {
		user2 := createAdminBanTestUser(t, userRepo, "adminbantest_target2")

		payload := map[string]interface{}{
			"reason":      "",
			"show_reason": true,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/v1/admin/users/"+strconv.Itoa(user2.ID)+"/ban", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", strconv.Itoa(admin.ID))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Contains(t, response["error"], "Reason is required")

		// Verify user was NOT banned
		var banned bool
		err = pool.QueryRow(context.Background(), "SELECT banned FROM users WHERE id = $1", user2.ID).Scan(&banned)
		require.NoError(t, err)
		assert.False(t, banned)
	})

	t.Run("ban with invalid user ID", func(t *testing.T) {
		payload := map[string]interface{}{
			"reason":      "Test",
			"show_reason": true,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/v1/admin/users/invalid/ban", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Set("user_id", admin.ID)

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("ban without admin context", func(t *testing.T) {
		user3 := createAdminBanTestUser(t, userRepo, "adminbantest_target3")

		payload := map[string]interface{}{
			"reason":      "Test",
			"show_reason": true,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/v1/admin/users/"+strconv.Itoa(user3.ID)+"/ban", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		// Don't set user_id
		c.Params = gin.Params{{Key: "id", Value: strconv.Itoa(user3.ID)}}

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestShadowBanUserHandler(t *testing.T) {
	router, userRepo, pool, cleanup := setupAdminBanTestEnv(t)
	defer cleanup()

	admin := createAdminBanTestUser(t, userRepo, "adminbantest_admin_shadow")
	targetUser := createAdminBanTestUser(t, userRepo, "adminbantest_target_shadow")

	t.Run("successful shadow ban", func(t *testing.T) {
		payload := map[string]interface{}{
			"reason":      "Suspicious activity",
			"show_reason": false,
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/v1/admin/users/"+strconv.Itoa(targetUser.ID)+"/shadow-ban", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", strconv.Itoa(admin.ID))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify in database
		var shadowBanned bool
		var showReason bool
		err := pool.QueryRow(context.Background(),
			"SELECT shadow_banned, show_ban_reason FROM users WHERE id = $1",
			targetUser.ID,
		).Scan(&shadowBanned, &showReason)
		require.NoError(t, err)
		assert.True(t, shadowBanned)
		assert.False(t, showReason)
	})
}

func TestUnbanUserHandler(t *testing.T) {
	router, userRepo, pool, cleanup := setupAdminBanTestEnv(t)
	defer cleanup()

	ctx := context.Background()
	admin := createAdminBanTestUser(t, userRepo, "adminbantest_admin_unban")
	targetUser := createAdminBanTestUser(t, userRepo, "adminbantest_target_unban")

	// First ban the user
	err := userRepo.BanUser(ctx, targetUser.ID, "Test ban", true, admin.ID)
	require.NoError(t, err)

	t.Run("successful unban", func(t *testing.T) {
		payload := map[string]interface{}{
			"reason": "Appeal approved",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/v1/admin/users/"+strconv.Itoa(targetUser.ID)+"/unban", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", strconv.Itoa(admin.ID))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify user is unbanned
		var banned bool
		err := pool.QueryRow(ctx, "SELECT banned FROM users WHERE id = $1", targetUser.ID).Scan(&banned)
		require.NoError(t, err)
		assert.False(t, banned)

		// Verify history entry
		var action string
		err = pool.QueryRow(ctx,
			"SELECT action FROM ban_history WHERE user_id = $1 AND action = 'unban'",
			targetUser.ID,
		).Scan(&action)
		require.NoError(t, err)
		assert.Equal(t, "unban", action)
	})
}

func TestSoftDeleteUserHandler(t *testing.T) {
	router, userRepo, pool, cleanup := setupAdminBanTestEnv(t)
	defer cleanup()

	admin := createAdminBanTestUser(t, userRepo, "adminbantest_admin_delete")
	targetUser := createAdminBanTestUser(t, userRepo, "adminbantest_target_delete")

	t.Run("successful soft delete", func(t *testing.T) {
		var beforeTokenVersion int
		require.NoError(t, pool.QueryRow(context.Background(), "SELECT token_version FROM users WHERE id = $1", targetUser.ID).Scan(&beforeTokenVersion))

		payload := map[string]interface{}{
			"reason": "ToS violation",
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/v1/admin/users/"+strconv.Itoa(targetUser.ID)+"/delete", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", strconv.Itoa(admin.ID))

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify user is soft deleted
		var deleted bool
		err := pool.QueryRow(context.Background(), "SELECT deleted FROM users WHERE id = $1", targetUser.ID).Scan(&deleted)
		require.NoError(t, err)
		assert.True(t, deleted)

		var afterTokenVersion int
		err = pool.QueryRow(context.Background(), "SELECT token_version FROM users WHERE id = $1", targetUser.ID).Scan(&afterTokenVersion)
		require.NoError(t, err)
		assert.Equal(t, beforeTokenVersion+1, afterTokenVersion)
	})
}

func TestGetBanHistoryHandler(t *testing.T) {
	router, userRepo, _, cleanup := setupAdminBanTestEnv(t)
	defer cleanup()

	ctx := context.Background()
	admin := createAdminBanTestUser(t, userRepo, "adminbantest_admin_history")
	targetUser := createAdminBanTestUser(t, userRepo, "adminbantest_target_history")

	// Create some ban history
	_ = userRepo.BanUser(ctx, targetUser.ID, "First ban", true, admin.ID)
	_ = userRepo.UnbanUser(ctx, targetUser.ID, "Unbanned", admin.ID)
	_ = userRepo.ShadowBanUser(ctx, targetUser.ID, "Shadow banned", false, admin.ID)

	t.Run("get user ban history", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/admin/users/"+strconv.Itoa(targetUser.ID)+"/ban-history", nil)

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Params = gin.Params{{Key: "id", Value: strconv.Itoa(targetUser.ID)}}

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		history := response["history"].([]interface{})
		assert.Len(t, history, 3)

		// Verify order (most recent first)
		firstEntry := history[0].(map[string]interface{})
		assert.Equal(t, "shadow_ban", firstEntry["action"])
	})
}

func TestGetAllBanHistoryHandler(t *testing.T) {
	router, userRepo, _, cleanup := setupAdminBanTestEnv(t)
	defer cleanup()

	ctx := context.Background()
	admin := createAdminBanTestUser(t, userRepo, "adminbantest_admin_allhistory")

	// Create multiple users with ban history
	for i := 1; i <= 5; i++ {
		user := createAdminBanTestUser(t, userRepo, "adminbantest_user_"+strconv.Itoa(i))
		_ = userRepo.BanUser(ctx, user.ID, "Test ban", true, admin.ID)
	}

	t.Run("get all ban history with default pagination", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/admin/ban-history", nil)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		history := response["history"].([]interface{})
		assert.GreaterOrEqual(t, len(history), 5)
		assert.NotNil(t, response["total"])
		assert.NotNil(t, response["limit"])
		assert.NotNil(t, response["offset"])
	})

	t.Run("get all ban history with custom pagination", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/v1/admin/ban-history?limit=2&offset=0", nil)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		history := response["history"].([]interface{})
		assert.LessOrEqual(t, len(history), 2)
		assert.Equal(t, float64(2), response["limit"])
		assert.Equal(t, float64(0), response["offset"])
	})
}
