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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var groupsTestCounter int64

func uniqueGroupUsername(base string) string {
	id := atomic.AddInt64(&groupsTestCounter, 1)
	return fmt.Sprintf("%s_grp_%d_%d", base, time.Now().UnixNano(), id)
}

func setupGroupsHandlerTest(t *testing.T) (*GroupHandler, *database.Database, []int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	userIDs := make([]int, 4)
	for i := range userIDs {
		u := &models.User{
			Username:     uniqueGroupUsername(fmt.Sprintf("u%d", i)),
			PasswordHash: "test_hash",
		}
		require.NoError(t, userRepo.Create(ctx, u))
		userIDs[i] = u.ID
	}

	handler := NewGroupHandler(db.Pool)
	cleanup := func() { db.Close() }
	return handler, db, userIDs, cleanup
}

// createTestGroup creates a group via the DB directly and returns conversation ID.
func createTestGroup(t *testing.T, db *database.Database, ownerID int, memberIDs []int) int {
	t.Helper()
	ctx := context.Background()

	var convID int
	err := db.Pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, is_group, group_name, created_by, max_participants, last_message_at)
		VALUES ('group', TRUE, 'Test Group', $1, 250, NOW())
		RETURNING id
	`, ownerID).Scan(&convID)
	require.NoError(t, err)

	// Add owner
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
		VALUES ($1, $2, 'owner', NOW())
	`, convID, ownerID)
	require.NoError(t, err)

	// Add group settings
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO group_settings (conversation_id, anyone_can_invite, anyone_can_pin, message_history_visible)
		VALUES ($1, false, false, true)
	`, convID)
	require.NoError(t, err)

	// Add members
	for _, memberID := range memberIDs {
		_, err = db.Pool.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
			VALUES ($1, $2, 'member', NOW())
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`, convID, memberID)
		require.NoError(t, err)
	}

	return convID
}

func TestCreateGroupConversation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("success with valid members returns 201", func(t *testing.T) {
		handler, _, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		ownerID := userIDs[0]
		router := gin.New()
		router.POST("/conversations/groups", func(c *gin.Context) {
			c.Set("user_id", ownerID)
			c.Set("authenticated", true)
			handler.CreateGroup(c)
		})

		body := map[string]interface{}{
			"name":            "My Test Group",
			"participant_ids": []int{userIDs[1], userIDs[2]},
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/conversations/groups", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		var resp GroupConversationResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.True(t, resp.IsGroup)
		assert.Greater(t, resp.ID, 0)
		assert.NotNil(t, resp.GroupName)
		assert.Equal(t, "My Test Group", *resp.GroupName)
		assert.Equal(t, "owner", resp.CurrentUserRole)
	})

	t.Run("too few participants returns 400", func(t *testing.T) {
		handler, _, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		router := gin.New()
		router.POST("/conversations/groups", func(c *gin.Context) {
			c.Set("user_id", userIDs[0])
			c.Set("authenticated", true)
			handler.CreateGroup(c)
		})

		body := map[string]interface{}{
			"name":            "Too Small Group",
			"participant_ids": []int{userIDs[1]}, // only 1 other — need 2 minimum
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/conversations/groups", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		handler, _, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		router := gin.New()
		router.POST("/conversations/groups", func(c *gin.Context) {
			// No user_id set
			handler.CreateGroup(c)
		})

		body := map[string]interface{}{
			"name":            "Unauth Group",
			"participant_ids": []int{userIDs[1], userIDs[2]},
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/conversations/groups", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("too many members returns 400", func(t *testing.T) {
		handler, _, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		// Build a list of 251 fake participant IDs (deduplicated by the handler)
		bigList := make([]int, 251)
		for i := range bigList {
			bigList[i] = 1000000 + i // fake IDs
		}

		router := gin.New()
		router.POST("/conversations/groups", func(c *gin.Context) {
			c.Set("user_id", userIDs[0])
			c.Set("authenticated", true)
			handler.CreateGroup(c)
		})

		body := map[string]interface{}{
			"name":            "Giant Group",
			"participant_ids": bigList,
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/conversations/groups", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestGetGroupParticipants(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("member can list participants", func(t *testing.T) {
		handler, db, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		ownerID := userIDs[0]
		memberID := userIDs[1]
		convID := createTestGroup(t, db, ownerID, []int{memberID})

		router := gin.New()
		router.GET("/conversations/:id/participants", func(c *gin.Context) {
			c.Set("user_id", memberID)
			c.Set("authenticated", true)
			handler.GetGroupParticipants(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/conversations/%d/participants", convID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]interface{}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.Contains(t, resp, "participants")
	})

	t.Run("non-member gets 403", func(t *testing.T) {
		handler, db, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		ownerID := userIDs[0]
		outsiderID := userIDs[3]
		convID := createTestGroup(t, db, ownerID, []int{userIDs[1]})

		router := gin.New()
		router.GET("/conversations/:id/participants", func(c *gin.Context) {
			c.Set("user_id", outsiderID)
			c.Set("authenticated", true)
			handler.GetGroupParticipants(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/conversations/%d/participants", convID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestLeaveGroup(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("member can leave group", func(t *testing.T) {
		handler, db, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		ownerID := userIDs[0]
		memberID := userIDs[1]
		convID := createTestGroup(t, db, ownerID, []int{memberID, userIDs[2]})

		router := gin.New()
		router.POST("/conversations/:id/leave", func(c *gin.Context) {
			c.Set("user_id", memberID)
			c.Set("authenticated", true)
			handler.LeaveGroup(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/leave", convID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNoContent, w.Code)
	})

	t.Run("owner cannot leave without transferring ownership", func(t *testing.T) {
		handler, db, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		ownerID := userIDs[0]
		convID := createTestGroup(t, db, ownerID, []int{userIDs[1], userIDs[2]})

		router := gin.New()
		router.POST("/conversations/:id/leave", func(c *gin.Context) {
			c.Set("user_id", ownerID)
			c.Set("authenticated", true)
			handler.LeaveGroup(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/leave", convID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusConflict, w.Code)
	})
}

func TestTransferGroupOwnership(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("owner can transfer to another member", func(t *testing.T) {
		handler, db, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		ownerID := userIDs[0]
		newOwnerID := userIDs[1]
		convID := createTestGroup(t, db, ownerID, []int{newOwnerID, userIDs[2]})

		router := gin.New()
		router.POST("/conversations/:id/transfer-ownership", func(c *gin.Context) {
			c.Set("user_id", ownerID)
			c.Set("authenticated", true)
			handler.TransferOwnership(c)
		})

		body := map[string]interface{}{"new_owner_user_id": newOwnerID}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/transfer-ownership", convID), bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify new owner role in DB
		var role string
		err := db.Pool.QueryRow(context.Background(), `
			SELECT role FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2
		`, convID, newOwnerID).Scan(&role)
		require.NoError(t, err)
		assert.Equal(t, "owner", role)
	})

	t.Run("non-owner cannot transfer ownership", func(t *testing.T) {
		handler, db, userIDs, cleanup := setupGroupsHandlerTest(t)
		defer cleanup()

		ownerID := userIDs[0]
		memberID := userIDs[1]
		convID := createTestGroup(t, db, ownerID, []int{memberID, userIDs[2]})

		router := gin.New()
		router.POST("/conversations/:id/transfer-ownership", func(c *gin.Context) {
			c.Set("user_id", memberID)
			c.Set("authenticated", true)
			handler.TransferOwnership(c)
		})

		body := map[string]interface{}{"new_owner_user_id": userIDs[2]}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/transfer-ownership", convID), bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}
