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
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var accountDeletionTestCounter int64

func uniqueAccountDeletionUsername(base string) string {
	id := atomic.AddInt64(&accountDeletionTestCounter, 1)
	return fmt.Sprintf("%s_accdel_%d_%d", base, time.Now().UnixNano(), id)
}

func setupAccountDeletionTest(t *testing.T) (*AccountDeletionHandler, *database.Database, int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	hash, err := utils.HashPassword("correct-password")
	require.NoError(t, err)
	email := fmt.Sprintf("%s@example.com", uniqueAccountDeletionUsername("email"))

	user := &models.User{
		Username:     uniqueAccountDeletionUsername("deluser"),
		PasswordHash: hash,
	}
	require.NoError(t, userRepo.Create(ctx, user))
	_, err = db.Pool.Exec(ctx, `
		UPDATE users
		SET email = $1, email_encrypted = false
		WHERE id = $2
	`, email, user.ID)
	require.NoError(t, err)

	handler := NewAccountDeletionHandler(db.Pool, nil) // nil queue — no email needed in tests

	cleanup := func() { db.Close() }
	return handler, db, user.ID, cleanup
}

func TestRequestAccountDeletion(t *testing.T) {
	gin.SetMode(gin.TestMode)

	testCases := []struct {
		name           string
		body           map[string]interface{}
		expectedStatus int
	}{
		{
			name: "valid request schedules deletion",
			body: map[string]interface{}{
				"password": "correct-password",
				"confirm":  "DELETE MY ACCOUNT",
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "wrong confirm phrase returns 400",
			body: map[string]interface{}{
				"password": "correct-password",
				"confirm":  "delete my account",
			},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name: "wrong password returns 401",
			body: map[string]interface{}{
				"password": "wrong-password",
				"confirm":  "DELETE MY ACCOUNT",
			},
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "missing body returns 400",
			body:           map[string]interface{}{},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			handler, db, userID, cleanup := setupAccountDeletionTest(t)
			defer cleanup()

			router := gin.New()
			router.POST("/account/delete", func(c *gin.Context) {
				c.Set("user_id", userID)
				handler.RequestAccountDeletion(c)
			})

			bodyBytes, _ := json.Marshal(tc.body)
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/account/delete", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)
			assert.Equal(t, tc.expectedStatus, w.Code)

			if tc.expectedStatus != http.StatusOK {
				return
			}

			var tokenVersion int
			err := db.Pool.QueryRow(context.Background(), `
				SELECT token_version
				FROM users
				WHERE id = $1
			`, userID).Scan(&tokenVersion)
			require.NoError(t, err)
			assert.Equal(t, 1, tokenVersion)

			userRepo := models.NewUserRepository(db.Pool)
			user, err := userRepo.GetByID(context.Background(), userID)
			require.NoError(t, err)
			require.NotNil(t, user)
			require.NotNil(t, user.DeletedAt)
			require.NotNil(t, user.PermanentDeletionAt)
			assert.Contains(t, user.Username, "deluser_accdel_")
			require.NotNil(t, user.Email)
			assert.Contains(t, *user.Email, "@example.com")
		})
	}
}

func TestRequestAccountDeletion_Unauthenticated(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, _, cleanup := setupAccountDeletionTest(t)
	defer cleanup()

	router := gin.New()
	// No user_id set in context — simulates unauthenticated request
	router.POST("/account/delete", func(c *gin.Context) {
		// user_id will be 0 (zero value), which will fail DB lookup
		handler.RequestAccountDeletion(c)
	})

	body := map[string]interface{}{
		"password": "correct-password",
		"confirm":  "DELETE MY ACCOUNT",
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/account/delete", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	// When user_id=0 the DB query will fail to find the user — expect 500
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestRequestAccountDeletion_AlreadyPendingReturnsBadRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, userID, cleanup := setupAccountDeletionTest(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		UPDATE users
		SET deleted_at = NOW(), permanent_deletion_at = NOW() + INTERVAL '30 days'
		WHERE id = $1
	`, userID)
	require.NoError(t, err)

	router := gin.New()
	router.POST("/account/delete", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.RequestAccountDeletion(c)
	})

	body := map[string]interface{}{
		"password": "correct-password",
		"confirm":  "DELETE MY ACCOUNT",
	}
	bodyBytes, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/account/delete", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
