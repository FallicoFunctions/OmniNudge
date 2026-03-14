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
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var groupAdminTestCounter int64

func uniqueGroupAdminUsername(base string) string {
	id := atomic.AddInt64(&groupAdminTestCounter, 1)
	return fmt.Sprintf("%s_grpadm_%d_%d", base, time.Now().UnixNano(), id)
}

func setupGroupAdminHandlerTest(t *testing.T) (*GroupAdminHandler, *GroupHandler, *database.Database, []int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	userIDs := make([]int, 5)
	for i := range userIDs {
		u := &models.User{
			Username:     uniqueGroupAdminUsername(fmt.Sprintf("u%d", i)),
			PasswordHash: "test_hash",
		}
		require.NoError(t, userRepo.Create(ctx, u))
		userIDs[i] = u.ID
	}

	hub := &mockHub{}
	cache := services.NoopCache{}
	adminHandler := NewGroupAdminHandler(db.Pool, hub, cache)
	groupHandler := NewGroupHandler(db.Pool)

	cleanup := func() { db.Close() }
	return adminHandler, groupHandler, db, userIDs, cleanup
}

// createTestGroupWithAdmin creates a group and adds an admin member.
// Returns (convID, ownerID, adminID, memberID).
func createTestGroupWithAdmin(t *testing.T, db *database.Database, userIDs []int) (int, int, int, int) {
	t.Helper()
	ownerID := userIDs[0]
	adminID := userIDs[1]
	memberID := userIDs[2]

	convID := createTestGroup(t, db, ownerID, []int{adminID, memberID})

	// Promote adminID to admin
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE conversation_participants SET role = 'admin'
		WHERE conversation_id = $1 AND user_id = $2
	`, convID, adminID)
	require.NoError(t, err)

	return convID, ownerID, adminID, memberID
}

func TestUpdateGroupSettings(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("owner can update group settings", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, ownerID, _, _ := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.PATCH("/conversations/:id/settings", func(c *gin.Context) {
			c.Set("user_id", ownerID)
			c.Set("authenticated", true)
			groupHandler.UpdateGroupSettings(c)
		})

		body := map[string]interface{}{
			"anyone_can_invite": true,
			"anyone_can_pin":    true,
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/conversations/%d/settings", convID), bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("regular member cannot update group settings", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, _, _, memberID := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.PATCH("/conversations/:id/settings", func(c *gin.Context) {
			c.Set("user_id", memberID)
			c.Set("authenticated", true)
			groupHandler.UpdateGroupSettings(c)
		})

		body := map[string]interface{}{"anyone_can_invite": true}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/conversations/%d/settings", convID), bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestPromoteMember(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("owner can promote member to admin", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, ownerID, _, memberID := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.PATCH("/conversations/:id/participants/:user_id", func(c *gin.Context) {
			c.Set("user_id", ownerID)
			c.Set("authenticated", true)
			groupHandler.UpdateParticipantRole(c)
		})

		body := map[string]interface{}{"role": "admin"}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPatch,
			fmt.Sprintf("/conversations/%d/participants/%d", convID, memberID),
			bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		// Verify role in DB
		var role string
		err := db.Pool.QueryRow(context.Background(), `
			SELECT role FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2
		`, convID, memberID).Scan(&role)
		require.NoError(t, err)
		assert.Equal(t, "admin", role)
	})

	t.Run("non-owner cannot promote members", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, _, adminID, memberID := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.PATCH("/conversations/:id/participants/:user_id", func(c *gin.Context) {
			c.Set("user_id", adminID)
			c.Set("authenticated", true)
			groupHandler.UpdateParticipantRole(c)
		})

		body := map[string]interface{}{"role": "admin"}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPatch,
			fmt.Sprintf("/conversations/%d/participants/%d", convID, memberID),
			bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestDemoteMember(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("owner can demote admin to member", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, ownerID, adminID, _ := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.PATCH("/conversations/:id/participants/:user_id", func(c *gin.Context) {
			c.Set("user_id", ownerID)
			c.Set("authenticated", true)
			groupHandler.UpdateParticipantRole(c)
		})

		body := map[string]interface{}{"role": "member"}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPatch,
			fmt.Sprintf("/conversations/%d/participants/%d", convID, adminID),
			bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var role string
		err := db.Pool.QueryRow(context.Background(), `
			SELECT role FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2
		`, convID, adminID).Scan(&role)
		require.NoError(t, err)
		assert.Equal(t, "member", role)
	})
}

func TestKickMember(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("admin can kick regular member", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, _, adminID, memberID := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.DELETE("/conversations/:id/participants/:user_id", func(c *gin.Context) {
			c.Set("user_id", adminID)
			c.Set("authenticated", true)
			groupHandler.RemoveGroupParticipant(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodDelete,
			fmt.Sprintf("/conversations/%d/participants/%d", convID, memberID), nil)
		router.ServeHTTP(w, req)

		// RemoveGroupParticipant returns 204 on success
		assert.Equal(t, http.StatusNoContent, w.Code)

		// Verify member is gone
		var count int
		err := db.Pool.QueryRow(context.Background(), `
			SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2
		`, convID, memberID).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 0, count)
	})

	t.Run("cannot kick the group owner", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, ownerID, adminID, _ := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.DELETE("/conversations/:id/participants/:user_id", func(c *gin.Context) {
			c.Set("user_id", adminID)
			c.Set("authenticated", true)
			groupHandler.RemoveGroupParticipant(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodDelete,
			fmt.Sprintf("/conversations/%d/participants/%d", convID, ownerID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("regular member cannot kick others", func(t *testing.T) {
		_, groupHandler, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, _, _, memberID := createTestGroupWithAdmin(t, db, userIDs)
		// Add a 4th member to try to kick
		fourthID := userIDs[3]
		_, err := db.Pool.Exec(context.Background(), `
			INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
			VALUES ($1, $2, 'member', NOW())
			ON CONFLICT DO NOTHING
		`, convID, fourthID)
		require.NoError(t, err)

		router := gin.New()
		router.DELETE("/conversations/:id/participants/:user_id", func(c *gin.Context) {
			c.Set("user_id", memberID)
			c.Set("authenticated", true)
			groupHandler.RemoveGroupParticipant(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodDelete,
			fmt.Sprintf("/conversations/%d/participants/%d", convID, fourthID), nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestMuteGroupMember(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("admin can mute a member", func(t *testing.T) {
		adminHandler, _, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, _, adminID, memberID := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.POST("/groups/:id/members/:user_id/mute", func(c *gin.Context) {
			c.Set("user_id", adminID)
			c.Set("authenticated", true)
			adminHandler.MuteGroupMember(c)
		})

		body := map[string]interface{}{
			"duration_minutes": 60,
			"reason":           "Spamming",
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost,
			fmt.Sprintf("/groups/%d/members/%d/mute", convID, memberID),
			bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("non-admin cannot mute members", func(t *testing.T) {
		adminHandler, _, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, _, _, memberID := createTestGroupWithAdmin(t, db, userIDs)
		// Use a fresh member trying to mute another member
		anotherMemberID := userIDs[3]
		_, err := db.Pool.Exec(context.Background(), `
			INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
			VALUES ($1, $2, 'member', NOW()) ON CONFLICT DO NOTHING
		`, convID, anotherMemberID)
		require.NoError(t, err)

		router := gin.New()
		router.POST("/groups/:id/members/:user_id/mute", func(c *gin.Context) {
			c.Set("user_id", anotherMemberID)
			c.Set("authenticated", true)
			adminHandler.MuteGroupMember(c)
		})

		body := map[string]interface{}{"duration_minutes": 60, "reason": "test"}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost,
			fmt.Sprintf("/groups/%d/members/%d/mute", convID, memberID),
			bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("cannot mute the group owner", func(t *testing.T) {
		adminHandler, _, db, userIDs, cleanup := setupGroupAdminHandlerTest(t)
		defer cleanup()

		convID, ownerID, adminID, _ := createTestGroupWithAdmin(t, db, userIDs)

		router := gin.New()
		router.POST("/groups/:id/members/:user_id/mute", func(c *gin.Context) {
			c.Set("user_id", adminID)
			c.Set("authenticated", true)
			adminHandler.MuteGroupMember(c)
		})

		body := map[string]interface{}{"duration_minutes": 60, "reason": "test"}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost,
			fmt.Sprintf("/groups/%d/members/%d/mute", convID, ownerID),
			bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}
