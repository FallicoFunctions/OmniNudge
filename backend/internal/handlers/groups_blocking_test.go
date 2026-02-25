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

var groupsBlockingTestCounter int64

func uniqueGroupsBlockingUsername(base string) string {
	id := atomic.AddInt64(&groupsBlockingTestCounter, 1)
	return fmt.Sprintf("%s_groups_blocking_%d_%d", base, time.Now().UnixNano(), id)
}

func setupGroupHandlerTestUsers(t *testing.T) (*GroupHandler, *database.Database, int, int, int, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: uniqueGroupsBlockingUsername("owner"), PasswordHash: "test_hash"}
	inviter := &models.User{Username: uniqueGroupsBlockingUsername("inviter"), PasswordHash: "test_hash"}
	target := &models.User{Username: uniqueGroupsBlockingUsername("target"), PasswordHash: "test_hash"}
	extra := &models.User{Username: uniqueGroupsBlockingUsername("extra"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(ctx, owner))
	require.NoError(t, userRepo.Create(ctx, inviter))
	require.NoError(t, userRepo.Create(ctx, target))
	require.NoError(t, userRepo.Create(ctx, extra))

	var conversationID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO conversations
			(conversation_type, is_group, group_name, created_by, max_participants, last_message_at)
		VALUES
			('group', TRUE, 'test group', $1, 250, CURRENT_TIMESTAMP)
		RETURNING id
	`, owner.ID).Scan(&conversationID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
		VALUES
			($1, $2, 'owner', CURRENT_TIMESTAMP),
			($1, $3, 'admin', CURRENT_TIMESTAMP)
	`, conversationID, owner.ID, inviter.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO group_settings (conversation_id, anyone_can_invite, anyone_can_pin, message_history_visible)
		VALUES ($1, TRUE, FALSE, TRUE)
	`, conversationID)
	require.NoError(t, err)

	handler := NewGroupHandler(db.Pool)
	cleanup := func() { db.Close() }
	return handler, db, conversationID, owner.ID, inviter.ID, target.ID, cleanup
}

func TestCreateGroupInvite_BlockedUsersForbidden(t *testing.T) {
	handler, db, conversationID, _, inviterID, targetID, cleanup := setupGroupHandlerTestUsers(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, targetID, inviterID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/:id/invites", func(c *gin.Context) {
		c.Set("user_id", inviterID)
		handler.CreateGroupInvite(c)
	})

	body, _ := json.Marshal(map[string]int{"user_id": targetID})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/invites", conversationID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "blocking settings")
}

func TestCreateGroupInvite_BlockedAgainstExistingMemberForbidden(t *testing.T) {
	handler, db, conversationID, ownerID, _, targetID, cleanup := setupGroupHandlerTestUsers(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, ownerID, targetID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/:id/invites", func(c *gin.Context) {
		c.Set("user_id", ownerID)
		handler.CreateGroupInvite(c)
	})

	body, _ := json.Marshal(map[string]int{"user_id": targetID})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/invites", conversationID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "blocking settings")
}

func TestAddGroupParticipant_BlockedUsersForbidden(t *testing.T) {
	handler, db, conversationID, _, inviterID, targetID, cleanup := setupGroupHandlerTestUsers(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, inviterID, targetID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/:id/participants", func(c *gin.Context) {
		c.Set("user_id", inviterID)
		handler.AddGroupParticipant(c)
	})

	body, _ := json.Marshal(map[string]int{"user_id": targetID})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/participants", conversationID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "blocking settings")
}

func TestAddGroupParticipant_BlockedAgainstExistingMemberForbidden(t *testing.T) {
	handler, db, conversationID, ownerID, _, targetID, cleanup := setupGroupHandlerTestUsers(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, ownerID, targetID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/:id/participants", func(c *gin.Context) {
		c.Set("user_id", ownerID)
		handler.AddGroupParticipant(c)
	})

	body, _ := json.Marshal(map[string]int{"user_id": targetID})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/participants", conversationID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "blocking settings")
}

func TestAcceptGroupInvite_BlockedAgainstExistingMemberForbidden(t *testing.T) {
	handler, db, conversationID, ownerID, _, targetID, cleanup := setupGroupHandlerTestUsers(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, ownerID, targetID)
	require.NoError(t, err)

	var inviteID int
	err = db.Pool.QueryRow(context.Background(), `
		INSERT INTO group_invites (conversation_id, invited_user_id, invited_by, status, expires_at)
		VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP + INTERVAL '7 days')
		RETURNING id
	`, conversationID, targetID, ownerID).Scan(&inviteID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/group-invites/:id/accept", func(c *gin.Context) {
		c.Set("user_id", targetID)
		handler.AcceptGroupInvite(c)
	})

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/group-invites/%d/accept", inviteID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "blocking settings")
}

func TestCreateGroup_PairwiseBlockingForbidden(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: uniqueGroupsBlockingUsername("oc"), PasswordHash: "test_hash"}
	u2 := &models.User{Username: uniqueGroupsBlockingUsername("u2"), PasswordHash: "test_hash"}
	u3 := &models.User{Username: uniqueGroupsBlockingUsername("u3"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(ctx, owner))
	require.NoError(t, userRepo.Create(ctx, u2))
	require.NoError(t, userRepo.Create(ctx, u3))

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, u2.ID, u3.ID)
	require.NoError(t, err)

	handler := NewGroupHandler(db.Pool)
	router := gin.Default()
	router.POST("/conversations/groups", func(c *gin.Context) {
		c.Set("user_id", owner.ID)
		handler.CreateGroup(c)
	})

	body, _ := json.Marshal(map[string]any{
		"name":            "blocked pair group",
		"participant_ids": []int{u2.ID, u3.ID},
	})
	req := httptest.NewRequest(http.MethodPost, "/conversations/groups", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "blocking settings")
}

func TestCreateGroupInvite_ExistingNonRequesterBlockedPairInGroupForbidden(t *testing.T) {
	handler, db, conversationID, ownerID, inviterID, targetID, cleanup := setupGroupHandlerTestUsers(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	memberA := &models.User{Username: uniqueGroupsBlockingUsername("member_a"), PasswordHash: "test_hash"}
	memberB := &models.User{Username: uniqueGroupsBlockingUsername("member_b"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(ctx, memberA))
	require.NoError(t, userRepo.Create(ctx, memberB))

	_, err := db.Pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at, invited_by)
		VALUES
			($1, $2, 'member', CURRENT_TIMESTAMP, $3),
			($1, $4, 'member', CURRENT_TIMESTAMP, $3)
	`, conversationID, memberA.ID, ownerID, memberB.ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, memberA.ID, memberB.ID)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/:id/invites", func(c *gin.Context) {
		c.Set("user_id", inviterID)
		handler.CreateGroupInvite(c)
	})

	body, _ := json.Marshal(map[string]int{"user_id": targetID})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/invites", conversationID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code)
	assert.Contains(t, w.Body.String(), "blocking settings")
}
