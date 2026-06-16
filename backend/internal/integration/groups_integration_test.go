//go:build integration

package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/handlers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var groupsTestCounter int64

func uniqueGrpUsername(base string) string {
	id := atomic.AddInt64(&groupsTestCounter, 1)
	return fmt.Sprintf("%s_grp_%d_%d", base, time.Now().UnixNano(), id)
}

// groupTestDeps extends the base TestDeps with a router that includes group routes.
type groupTestDeps struct {
	*TestDeps
	GroupRouter *gin.Engine
}

// newGroupTestDeps builds all deps plus registers the /groups routes on the router.
func newGroupTestDeps(t *testing.T) *groupTestDeps {
	t.Helper()
	base := newTestDeps(t)

	groupHandler := handlers.NewGroupHandler(base.DB.Pool)
	groupAdminHandler := handlers.NewGroupAdminHandler(base.DB.Pool, base.Hub, services.NoopCache{})

	protected := base.Router.Group("/api/v1")
	protected.Use(middleware.AuthRequired(base.AuthService))
	{
		protected.POST("/groups", groupHandler.CreateGroup)
		protected.GET("/groups/:id/participants", groupHandler.GetGroupParticipants)
		protected.POST("/groups/:id/participants", groupHandler.AddGroupParticipant)
		protected.DELETE("/groups/:id/participants/:user_id", groupHandler.RemoveGroupParticipant)
		protected.PATCH("/groups/:id/participants/:user_id/role", groupHandler.UpdateParticipantRole)
		protected.GET("/groups/:id/settings", groupHandler.GetGroupSettings)
		protected.POST("/groups/:id/members/:user_id/ban", groupAdminHandler.BanGroupMember)
	}

	return &groupTestDeps{
		TestDeps:    base,
		GroupRouter: base.Router,
	}
}

// createGroupBody builds the JSON body for POST /groups.
func createGroupBody(name string, participantIDs []int) []byte {
	ids, _ := json.Marshal(participantIDs)
	return []byte(fmt.Sprintf(`{"name":%q,"participant_ids":%s}`, name, ids))
}

// doGroupRequest is a convenience wrapper that sets the Authorization header.
func doGroupRequest(t *testing.T, router http.Handler, method, path, token string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body != nil {
		req, _ = http.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req, _ = http.NewRequest(method, path, nil)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

// TestCreateGroupConversation verifies that a group with 3 members is created
// successfully and all members can send messages into the conversation.
func TestCreateGroupConversation(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("owner"), "user")
	member1 := createUser(t, deps.UserRepo, uniqueGrpUsername("m1"), "user")
	member2 := createUser(t, deps.UserRepo, uniqueGrpUsername("m2"), "user")

	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	m1Token, _ := deps.AuthService.GenerateJWT(member1.ID, member1.Username, member1.Role)

	// Create group
	body := createGroupBody("Test Group Alpha", []int{member1.ID, member2.ID})
	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)
	require.Equal(t, http.StatusCreated, w.Code, "group creation must return 201; body: %s", w.Body.String())

	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))
	assert.Greater(t, group.ID, 0)

	// Owner sends a message
	msgBody := fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"hello group","message_type":"text","encryption_version":"v1"}`,
		group.ID,
	)
	w2 := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", ownerToken, []byte(msgBody))
	assert.Equal(t, http.StatusCreated, w2.Code, "owner should be able to send message; body: %s", w2.Body.String())

	// Member1 sends a message
	msgBody2 := fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"hi from member1","message_type":"text","encryption_version":"v1"}`,
		group.ID,
	)
	w3 := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", m1Token, []byte(msgBody2))
	assert.Equal(t, http.StatusCreated, w3.Code, "member should be able to send message; body: %s", w3.Body.String())
}

// TestGroupMemberAdd verifies that adding a new member via the API succeeds
// and the new member can subsequently send messages in the conversation.
func TestGroupMemberAdd(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("owner2"), "user")
	member1 := createUser(t, deps.UserRepo, uniqueGrpUsername("m1b"), "user")
	newMember := createUser(t, deps.UserRepo, uniqueGrpUsername("newm"), "user")

	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	newMemberToken, _ := deps.AuthService.GenerateJWT(newMember.ID, newMember.Username, newMember.Role)

	// Create group with 2 initial members (owner + member1)
	body := createGroupBody("Test Group Beta", []int{member1.ID})
	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)

	// owner + 1 other = 2 total, but CreateGroup requires at least 2 others (3 total).
	// Add a placeholder second member.
	placeholder := createUser(t, deps.UserRepo, uniqueGrpUsername("ph"), "user")
	body = createGroupBody("Test Group Beta", []int{member1.ID, placeholder.ID})
	w = doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)
	require.Equal(t, http.StatusCreated, w.Code, "group creation: %s", w.Body.String())

	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

	// Add new member
	addBody := fmt.Sprintf(`{"user_id":%d}`, newMember.ID)
	w2 := doGroupRequest(t, deps.GroupRouter, http.MethodPost,
		fmt.Sprintf("/api/v1/groups/%d/participants", group.ID),
		ownerToken, []byte(addBody))
	assert.Equal(t, http.StatusCreated, w2.Code, "add member: %s", w2.Body.String())

	// New member sends a message
	msgBody := fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"hi, just joined","message_type":"text","encryption_version":"v1"}`,
		group.ID,
	)
	w3 := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", newMemberToken, []byte(msgBody))
	assert.Equal(t, http.StatusCreated, w3.Code, "new member send message: %s", w3.Body.String())
}

// TestGroupMemberRemove verifies that removing a member via the API succeeds
// and the removed member can no longer send messages in the conversation.
func TestGroupMemberRemove(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("owner3"), "user")
	toRemove := createUser(t, deps.UserRepo, uniqueGrpUsername("toremove"), "user")
	member2 := createUser(t, deps.UserRepo, uniqueGrpUsername("m2c"), "user")

	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	removedToken, _ := deps.AuthService.GenerateJWT(toRemove.ID, toRemove.Username, toRemove.Role)

	// Create group
	body := createGroupBody("Test Group Gamma", []int{toRemove.ID, member2.ID})
	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)
	require.Equal(t, http.StatusCreated, w.Code, "group creation: %s", w.Body.String())

	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

	// Remove toRemove
	w2 := doGroupRequest(t, deps.GroupRouter, http.MethodDelete,
		fmt.Sprintf("/api/v1/groups/%d/participants/%d", group.ID, toRemove.ID),
		ownerToken, nil)
	assert.Equal(t, http.StatusNoContent, w2.Code, "remove member: %s", w2.Body.String())

	// Removed member attempts to send a message — should fail
	msgBody := fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"should fail","message_type":"text","encryption_version":"v1"}`,
		group.ID,
	)
	w3 := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", removedToken, []byte(msgBody))
	assert.True(t,
		w3.Code == http.StatusForbidden || w3.Code == http.StatusUnauthorized || w3.Code == http.StatusBadRequest,
		"removed member must not be able to send messages, got %d: %s", w3.Code, w3.Body.String())
}

// TestGroupAdminPromote verifies that the owner can promote a member to admin
// and the promoted admin can then manage group participants.
func TestGroupAdminPromote(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("owner4"), "user")
	futureAdmin := createUser(t, deps.UserRepo, uniqueGrpUsername("fadmin"), "user")
	member2 := createUser(t, deps.UserRepo, uniqueGrpUsername("m2d"), "user")

	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	adminToken, _ := deps.AuthService.GenerateJWT(futureAdmin.ID, futureAdmin.Username, futureAdmin.Role)

	// Create group
	body := createGroupBody("Test Group Delta", []int{futureAdmin.ID, member2.ID})
	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)
	require.Equal(t, http.StatusCreated, w.Code, "group creation: %s", w.Body.String())

	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

	// Promote futureAdmin to admin
	roleBody := `{"role":"admin"}`
	w2 := doGroupRequest(t, deps.GroupRouter, http.MethodPatch,
		fmt.Sprintf("/api/v1/groups/%d/participants/%d/role", group.ID, futureAdmin.ID),
		ownerToken, []byte(roleBody))
	assert.Equal(t, http.StatusOK, w2.Code, "promote to admin: %s", w2.Body.String())

	// Verify via participants list that futureAdmin is now admin
	w3 := doGroupRequest(t, deps.GroupRouter, http.MethodGet,
		fmt.Sprintf("/api/v1/groups/%d/participants", group.ID),
		adminToken, nil)
	assert.Equal(t, http.StatusOK, w3.Code, "list participants: %s", w3.Body.String())

	var participantsResp struct {
		Participants []struct {
			UserID int    `json:"user_id"`
			Role   string `json:"role"`
		} `json:"participants"`
	}
	require.NoError(t, json.Unmarshal(w3.Body.Bytes(), &participantsResp))
	participants := participantsResp.Participants

	found := false
	for _, p := range participants {
		if p.UserID == futureAdmin.ID {
			assert.Equal(t, "admin", p.Role,
				"futureAdmin should have role=admin after promotion")
			found = true
		}
	}
	assert.True(t, found, "futureAdmin should appear in the participants list")
}

// TestGroupMessageEncryption verifies that encrypted group messages are stored
// and retrievable, and that the encryption_version field is preserved.
func TestGroupMessageEncryption(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("owner5"), "user")
	member1 := createUser(t, deps.UserRepo, uniqueGrpUsername("m1e"), "user")
	member2 := createUser(t, deps.UserRepo, uniqueGrpUsername("m2e"), "user")

	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	m1Token, _ := deps.AuthService.GenerateJWT(member1.ID, member1.Username, member1.Role)

	// Create group
	body := createGroupBody("Test Group Epsilon", []int{member1.ID, member2.ID})
	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)
	require.Equal(t, http.StatusCreated, w.Code, "group creation: %s", w.Body.String())

	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

	// Send an encrypted message
	const encryptedPayload = "AES256_ENCRYPTED_PAYLOAD_BASE64=="
	msgBody := fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":%q,"message_type":"text","encryption_version":"v1"}`,
		group.ID, encryptedPayload,
	)
	w2 := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", ownerToken, []byte(msgBody))
	require.Equal(t, http.StatusCreated, w2.Code, "send encrypted message: %s", w2.Body.String())

	var msg models.Message
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &msg))
	assert.Equal(t, encryptedPayload, msg.EncryptedContent, "encrypted content must be stored verbatim")
	assert.Equal(t, "v1", msg.EncryptionVersion, "encryption version must be preserved")

	// Member1 fetches the conversation messages and verifies the encrypted payload
	w3 := doGroupRequest(t, deps.GroupRouter, http.MethodGet,
		fmt.Sprintf("/api/v1/conversations/%d/messages", group.ID),
		m1Token, nil)
	assert.Equal(t, http.StatusOK, w3.Code, "fetch messages: %s", w3.Body.String())

	var messagesResp struct {
		Messages []models.Message `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w3.Body.Bytes(), &messagesResp))
	require.NotEmpty(t, messagesResp.Messages, "messages list should not be empty")

	found := false
	for _, m := range messagesResp.Messages {
		if m.EncryptedContent == encryptedPayload {
			assert.Equal(t, "v1", m.EncryptionVersion)
			found = true
		}
	}
	assert.True(t, found, "encrypted message should be retrievable by group members")
}

// TestGroupConversationLimit verifies that creating a group with 251 members
// (252 total including creator) is rejected with a 400 Bad Request.
func TestGroupConversationLimit(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("owner6"), "user")
	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)

	// Build a list of 251 participant IDs. We use fake non-existent IDs because
	// the limit check happens before DB inserts in the handler.
	participantIDs := make([]int, 251)
	for i := range participantIDs {
		participantIDs[i] = 99000 + i // non-existent user IDs
	}

	body := createGroupBody("Over Limit Group", participantIDs)
	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)
	assert.Equal(t, http.StatusBadRequest, w.Code,
		"groups with 251+ participants should be rejected with 400; body: %s", w.Body.String())
}
