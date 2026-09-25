//go:build integration

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"
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

	groupHandler := handlers.NewGroupHandler(base.DB.Pool, base.Hub)

	protected := base.Router.Group("/api/v1")
	protected.Use(middleware.AuthRequired(base.AuthService))
	{
		// newTestDeps already owns the routes a membership change needs
		// (add, remove, leave, ban); gin panics if they are registered twice.
		protected.POST("/groups", groupHandler.CreateGroup)
		protected.GET("/groups/:id/participants", groupHandler.GetGroupParticipants)
		protected.PATCH("/groups/:id/participants/:user_id/role", groupHandler.UpdateParticipantRole)
		protected.GET("/groups/:id/settings", groupHandler.GetGroupSettings)
		// The paths main.go registers, parameter names included: the handler
		// reads the invite id by the name the route gives it.
		protected.POST("/groups/:id/invites", groupHandler.CreateGroupInvite)
		protected.POST("/groups/invites/:invite_id/accept", groupHandler.AcceptGroupInvite)
		protected.POST("/groups/invites/:invite_id/decline", groupHandler.DeclineGroupInvite)
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

	// CreateGroup needs at least two members besides the owner.
	placeholder := createUser(t, deps.UserRepo, uniqueGrpUsername("ph"), "user")
	body := createGroupBody("Test Group Beta", []int{member1.ID, placeholder.ID})
	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken, body)
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

// TestGroupConversationReadByItsMembers covers GET /conversations/:id for a
// group. A group has no user1 or user2, and the handler checked only those, so
// every member got 403 -- and the app reads this route to learn a conversation
// is a group before it seals a message for it, so nothing could be sent.
func TestGroupConversationReadByItsMembers(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("readowner"), "user")
	member1 := createUser(t, deps.UserRepo, uniqueGrpUsername("readm1"), "user")
	member2 := createUser(t, deps.UserRepo, uniqueGrpUsername("readm2"), "user")
	outsider := createUser(t, deps.UserRepo, uniqueGrpUsername("readout"), "user")

	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	m1Token, _ := deps.AuthService.GenerateJWT(member1.ID, member1.Username, member1.Role)
	outsiderToken, _ := deps.AuthService.GenerateJWT(outsider.ID, outsider.Username, outsider.Role)

	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken,
		createGroupBody("Readable Group", []int{member1.ID, member2.ID}))
	require.Equal(t, http.StatusCreated, w.Code, "group creation: %s", w.Body.String())
	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))
	path := fmt.Sprintf("/api/v1/conversations/%d", group.ID)

	for _, token := range []string{ownerToken, m1Token} {
		r := doGroupRequest(t, deps.GroupRouter, http.MethodGet, path, token, nil)
		require.Equal(t, http.StatusOK, r.Code, "a member reads the group; body: %s", r.Body.String())
		var got struct {
			ID               int             `json:"id"`
			ConversationType string          `json:"conversation_type"`
			OtherUser        json.RawMessage `json:"other_user"`
		}
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &got))
		assert.Equal(t, group.ID, got.ID)
		assert.Equal(t, "group", got.ConversationType)
		assert.Empty(t, got.OtherUser, "a group has no other user")
	}

	r := doGroupRequest(t, deps.GroupRouter, http.MethodGet, path, outsiderToken, nil)
	assert.Equal(t, http.StatusForbidden, r.Code, "someone outside the group is refused")
}

// TestGroupMessagesComeNewestFirst: the chat view reverses the list it is
// given, as it does for a direct message. A group read oldest first showed its
// newest message at the top, and with a limit returned a long group's first
// messages instead of its latest.
func TestGroupMessagesComeNewestFirst(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("ordowner"), "user")
	m1 := createUser(t, deps.UserRepo, uniqueGrpUsername("ordm1"), "user")
	m2 := createUser(t, deps.UserRepo, uniqueGrpUsername("ordm2"), "user")
	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)

	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken,
		createGroupBody("Ordered Group", []int{m1.ID, m2.ID}))
	require.Equal(t, http.StatusCreated, w.Code, "group creation: %s", w.Body.String())
	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

	var sent []int
	for _, text := range []string{"first", "second", "third"} {
		body := fmt.Sprintf(`{"conversation_id":%d,"encrypted_content":%q,"message_type":"text","encryption_version":"v1"}`, group.ID, text)
		r := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", ownerToken, []byte(body))
		require.Equal(t, http.StatusCreated, r.Code, "send: %s", r.Body.String())
		var msg struct {
			ID int `json:"id"`
		}
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &msg))
		sent = append(sent, msg.ID)
		time.Sleep(5 * time.Millisecond)
	}

	ids := func(path string) []int {
		r := doGroupRequest(t, deps.GroupRouter, http.MethodGet, path, ownerToken, nil)
		require.Equal(t, http.StatusOK, r.Code, "list: %s", r.Body.String())
		var page struct {
			Messages []struct {
				ID int `json:"id"`
			} `json:"messages"`
		}
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &page))
		out := make([]int, 0, len(page.Messages))
		for _, m := range page.Messages {
			out = append(out, m.ID)
		}
		return out
	}

	base := fmt.Sprintf("/api/v1/conversations/%d/messages", group.ID)
	assert.Equal(t, []int{sent[2], sent[1], sent[0]}, ids(base+"?limit=50&offset=0"))
	assert.Equal(t, []int{sent[2], sent[1]}, ids(base+"?limit=2&offset=0"), "a limit keeps the latest, not the first")
}

// liveGroup makes a group of three and connects its two members' sockets.
type liveGroup struct {
	id           int
	ownerName    string
	ownerToken   string
	memberTokens []string
	members      []*gorillaws.Conn
}

// dialGroupSocket connects a user's socket and waits for its first event.
func dialGroupSocket(t *testing.T, deps *groupTestDeps, serverURL string, user *models.User) *gorillaws.Conn {
	t.Helper()
	token, _ := deps.AuthService.GenerateWebSocketJWT(user.ID, user.Username, user.Role, user.TokenVersion)
	h := http.Header{}
	h.Set("Origin", "http://localhost:8080")
	conn, _, err := gorillaws.DefaultDialer.Dial("ws"+serverURL[len("http"):]+"/api/v1/ws?token="+token, h)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	readWebSocketEvent(t, conn, 2*time.Second, func(e map[string]interface{}) bool { return e["type"] == "initial_state" })
	return conn
}

func newLiveGroup(t *testing.T, deps *groupTestDeps, serverURL, name string) liveGroup {
	t.Helper()
	owner := createUser(t, deps.UserRepo, uniqueGrpUsername(name+"owner"), "user")
	m1 := createUser(t, deps.UserRepo, uniqueGrpUsername(name+"m1"), "user")
	m2 := createUser(t, deps.UserRepo, uniqueGrpUsername(name+"m2"), "user")
	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)

	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken,
		createGroupBody("Live Group "+name, []int{m1.ID, m2.ID}))
	require.Equal(t, http.StatusCreated, w.Code, "group creation: %s", w.Body.String())
	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

	dial := func(user *models.User) *gorillaws.Conn { return dialGroupSocket(t, deps, serverURL, user) }
	m1Token, _ := deps.AuthService.GenerateJWT(m1.ID, m1.Username, m1.Role)
	m2Token, _ := deps.AuthService.GenerateJWT(m2.ID, m2.Username, m2.Role)
	return liveGroup{
		id:           group.ID,
		ownerName:    owner.Username,
		ownerToken:   ownerToken,
		memberTokens: []string{m1Token, m2Token},
		members:      []*gorillaws.Conn{dial(m1), dial(m2)},
	}
}

func (g liveGroup) send(t *testing.T, deps *groupTestDeps, text string) int {
	t.Helper()
	body := fmt.Sprintf(`{"conversation_id":%d,"encrypted_content":%q,"message_type":"text","encryption_version":"v1"}`, g.id, text)
	r := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", g.ownerToken, []byte(body))
	require.Equal(t, http.StatusCreated, r.Code, "send: %s", r.Body.String())
	var msg struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(r.Body.Bytes(), &msg))
	return msg.ID
}

// TestGroupMessageReachesTheOtherMembers: the new_message broadcast went to
// recipientID, which for a group is the sender, so no other member saw a
// message until they reloaded.
func TestGroupMessageReachesTheOtherMembers(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()
	ts := httptest.NewServer(deps.GroupRouter)
	defer ts.Close()

	g := newLiveGroup(t, deps, ts.URL, "live")
	g.send(t, deps, "live")
	for _, conn := range g.members {
		evt := readWebSocketEvent(t, conn, 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "new_message" })
		payload, _ := evt["payload"].(map[string]interface{})
		assert.EqualValues(t, g.id, payload["conversation_id"])
	}
}

// The name was added to the reads only, so a message that arrived live was
// named from the reader's cached member list -- "User" for anyone who joined
// after it was fetched. The broadcast carries the name itself.
func TestGroupMessageArrivesWithItsSenderName(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()
	ts := httptest.NewServer(deps.GroupRouter)
	defer ts.Close()

	g := newLiveGroup(t, deps, ts.URL, "named")
	g.send(t, deps, "who sent this")
	for _, conn := range g.members {
		evt := readWebSocketEvent(t, conn, 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "new_message" })
		payload, _ := evt["payload"].(map[string]interface{})
		assert.Equal(t, g.ownerName, payload["sender_username"])
	}
}

// TestGroupPinReachesTheOtherMembers: edits, pins and thread replies find their
// audience through getConversationParticipantIDs, which read a group as a
// direct message and found nobody in it.
func TestGroupPinReachesTheOtherMembers(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()
	ts := httptest.NewServer(deps.GroupRouter)
	defer ts.Close()

	g := newLiveGroup(t, deps, ts.URL, "pin")
	messageID := g.send(t, deps, "pin me")
	r := doGroupRequest(t, deps.GroupRouter, http.MethodPost, fmt.Sprintf("/api/v1/messages/%d/pin", messageID), g.ownerToken, nil)
	require.Equal(t, http.StatusOK, r.Code, "pin: %s", r.Body.String())
	for _, conn := range g.members {
		evt := readWebSocketEvent(t, conn, 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "message_pinned" })
		payload, _ := evt["payload"].(map[string]interface{})
		assert.EqualValues(t, messageID, payload["message_id"])
	}
}

// TestGroupReadReceiptReachesTheOtherMembers: conversation_read went to every
// participant only for mod mail; a group took the direct-message branch, found
// no other user, and told nobody it had been read.
func TestGroupReadReceiptReachesTheOtherMembers(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()
	ts := httptest.NewServer(deps.GroupRouter)
	defer ts.Close()

	g := newLiveGroup(t, deps, ts.URL, "read")
	g.send(t, deps, "read me")
	r := doGroupRequest(t, deps.GroupRouter, http.MethodPost, fmt.Sprintf("/api/v1/conversations/%d/read", g.id), g.memberTokens[0], nil)
	require.Equal(t, http.StatusOK, r.Code, "read: %s", r.Body.String())
	evt := readWebSocketEvent(t, g.members[1], 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "conversation_read" })
	payload, _ := evt["payload"].(map[string]interface{})
	assert.EqualValues(t, g.id, payload["conversation_id"])
}

// Accept and decline both answered 400 "Invalid invite ID" for every invite,
// so nobody could join a group by invitation.
func TestGroupInviteCanBeAnswered(t *testing.T) {
	for _, tc := range []struct {
		answer string
		status int
		joins  bool
	}{
		{"accept", http.StatusOK, true},
		{"decline", http.StatusNoContent, false},
	} {
		t.Run(tc.answer, func(t *testing.T) {
			deps := newGroupTestDeps(t)
			defer deps.DB.Close()

			owner := createUser(t, deps.UserRepo, uniqueGrpUsername("inv_owner"), "user")
			m1 := createUser(t, deps.UserRepo, uniqueGrpUsername("inv_m1"), "user")
			m2 := createUser(t, deps.UserRepo, uniqueGrpUsername("inv_m2"), "user")
			guest := createUser(t, deps.UserRepo, uniqueGrpUsername("inv_guest"), "user")
			ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
			guestToken, _ := deps.AuthService.GenerateJWT(guest.ID, guest.Username, guest.Role)

			w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken,
				createGroupBody("Invites", []int{m1.ID, m2.ID}))
			require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
			var group struct {
				ID int `json:"id"`
			}
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

			w = doGroupRequest(t, deps.GroupRouter, http.MethodPost,
				fmt.Sprintf("/api/v1/groups/%d/invites", group.ID), ownerToken,
				[]byte(fmt.Sprintf(`{"user_id":%d}`, guest.ID)))
			require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
			var invite struct {
				ID int `json:"id"`
			}
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &invite))

			w = doGroupRequest(t, deps.GroupRouter, http.MethodPost,
				fmt.Sprintf("/api/v1/groups/invites/%d/%s", invite.ID, tc.answer), guestToken, []byte(`{}`))
			require.Equal(t, tc.status, w.Code, w.Body.String())

			var joined bool
			require.NoError(t, deps.DB.Pool.QueryRow(context.Background(), `
				SELECT EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2)
			`, group.ID, guest.ID).Scan(&joined))
			assert.Equal(t, tc.joins, joined)
		})
	}
}

// An invite carries the older key versions the inviter wrapped, and accepting
// it hands them over: the newcomer reads the group's past on joining.
func TestGroupInviteBringsTheHistory(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()
	ctx := context.Background()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("hist_owner"), "user")
	m1 := createUser(t, deps.UserRepo, uniqueGrpUsername("hist_m1"), "user")
	m2 := createUser(t, deps.UserRepo, uniqueGrpUsername("hist_m2"), "user")
	guest := createUser(t, deps.UserRepo, uniqueGrpUsername("hist_guest"), "user")
	for _, u := range []*models.User{owner, m1, m2, guest} {
		_, err := deps.DB.Pool.Exec(ctx, `UPDATE users SET public_key = $1 WHERE id = $2`, fmt.Sprintf("pk-%d", u.ID), u.ID)
		require.NoError(t, err)
	}
	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	guestToken, _ := deps.AuthService.GenerateJWT(guest.ID, guest.Username, guest.Role)

	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken,
		createGroupBody("History", []int{m1.ID, m2.ID}))
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))
	keys := services.NewGroupKeyService(deps.DB.Pool)
	require.NoError(t, keys.Rotate(ctx, group.ID, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1,
		Copies:     map[int]string{owner.ID: "v1-owner", m1.ID: "v1-m1", m2.ID: "v1-m2"},
	}))

	w = doGroupRequest(t, deps.GroupRouter, http.MethodPost,
		fmt.Sprintf("/api/v1/groups/%d/invites", group.ID), ownerToken,
		[]byte(fmt.Sprintf(`{"user_id":%d,"history":{"1":"v1-guest"}}`, guest.ID)))
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var invite struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &invite))

	w = doGroupRequest(t, deps.GroupRouter, http.MethodPost,
		fmt.Sprintf("/api/v1/groups/invites/%d/accept", invite.ID), guestToken, []byte(`{}`))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	state, err := keys.State(ctx, group.ID, guest.ID)
	require.NoError(t, err)
	require.Len(t, state.MyCopies, 1, "the newcomer reads the history before anyone sends")
	assert.Equal(t, "v1-guest", state.MyCopies[0].WrappedKey)
}

// Names came from the current member list, so a member who was removed left
// every message they wrote signed "User". The message carries its sender now.
func TestGroupMessageKeepsItsSenderAfterTheyLeave(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, uniqueGrpUsername("nameowner"), "user")
	leaver := createUser(t, deps.UserRepo, uniqueGrpUsername("nameleaver"), "user")
	stayer := createUser(t, deps.UserRepo, uniqueGrpUsername("namestayer"), "user")
	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	leaverToken, _ := deps.AuthService.GenerateJWT(leaver.ID, leaver.Username, leaver.Role)

	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/groups", ownerToken,
		createGroupBody("Names", []int{leaver.ID, stayer.ID}))
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var group struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &group))

	for _, from := range []string{leaverToken, ownerToken} {
		body := fmt.Sprintf(`{"conversation_id":%d,"encrypted_content":"hi","message_type":"text","encryption_version":"v1"}`, group.ID)
		r := doGroupRequest(t, deps.GroupRouter, http.MethodPost, "/api/v1/messages", from, []byte(body))
		require.Equal(t, http.StatusCreated, r.Code, r.Body.String())
		time.Sleep(5 * time.Millisecond)
	}
	w = doGroupRequest(t, deps.GroupRouter, http.MethodDelete,
		fmt.Sprintf("/api/v1/groups/%d/participants/%d", group.ID, leaver.ID), ownerToken, nil)
	require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())

	senders := func(query string) map[int]string {
		r := doGroupRequest(t, deps.GroupRouter, http.MethodGet,
			fmt.Sprintf("/api/v1/conversations/%d/messages?%s", group.ID, query), ownerToken, nil)
		require.Equal(t, http.StatusOK, r.Code, r.Body.String())
		var page struct {
			Messages []struct {
				SenderID       int    `json:"sender_id"`
				SenderUsername string `json:"sender_username"`
			} `json:"messages"`
		}
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &page))
		out := map[int]string{}
		for _, m := range page.Messages {
			out[m.SenderID] = m.SenderUsername
		}
		return out
	}

	// The first page reads through the cursor query, a later one through the
	// offset query; both must sign the message.
	assert.Equal(t, map[int]string{leaver.ID: leaver.Username, owner.ID: owner.Username}, senders("limit=50"))
	assert.Equal(t, map[int]string{leaver.ID: leaver.Username}, senders("limit=1&offset=1"))
}

// A join is announced to the members, so an app holding older key versions
// the newcomer lacks can pass them on without anyone sending a message.
func TestGroupJoinIsAnnounced(t *testing.T) {
	for _, how := range []string{"added", "invited"} {
		t.Run(how, func(t *testing.T) {
			deps := newGroupTestDeps(t)
			defer deps.DB.Close()
			ts := httptest.NewServer(deps.GroupRouter)
			defer ts.Close()

			g := newLiveGroup(t, deps, ts.URL, "joined"+how)
			newcomer := createUser(t, deps.UserRepo, uniqueGrpUsername("joinednew"), "user")
			newcomerConn := dialGroupSocket(t, deps, ts.URL, newcomer)
			if how == "added" {
				w := doGroupRequest(t, deps.GroupRouter, http.MethodPost,
					fmt.Sprintf("/api/v1/groups/%d/participants", g.id), g.ownerToken,
					[]byte(fmt.Sprintf(`{"user_id":%d}`, newcomer.ID)))
				require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
			} else {
				w := doGroupRequest(t, deps.GroupRouter, http.MethodPost,
					fmt.Sprintf("/api/v1/groups/%d/invites", g.id), g.ownerToken,
					[]byte(fmt.Sprintf(`{"user_id":%d}`, newcomer.ID)))
				require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
				var invite struct {
					ID int `json:"id"`
				}
				require.NoError(t, json.Unmarshal(w.Body.Bytes(), &invite))
				newcomerToken, _ := deps.AuthService.GenerateJWT(newcomer.ID, newcomer.Username, newcomer.Role)
				w = doGroupRequest(t, deps.GroupRouter, http.MethodPost,
					fmt.Sprintf("/api/v1/groups/invites/%d/accept", invite.ID), newcomerToken, []byte(`{}`))
				require.Equal(t, http.StatusOK, w.Code, w.Body.String())
			}

			for _, conn := range g.members {
				evt := readWebSocketEvent(t, conn, 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "group_member_joined" })
				payload, _ := evt["payload"].(map[string]interface{})
				assert.EqualValues(t, g.id, payload["conversation_id"])
				assert.EqualValues(t, newcomer.ID, payload["user_id"])
			}
			// The join brought the newcomer whatever history it carried; their
			// app must look again at what it had recorded as missing.
			evt := readWebSocketEvent(t, newcomerConn, 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "group_keys_shared" })
			payload, _ := evt["payload"].(map[string]interface{})
			assert.EqualValues(t, g.id, payload["conversation_id"])
		})
	}
}

// A member given older key versions is told, so their app drops what it
// remembered as missing and opens the old messages without a reload.
func TestGroupKeysSharedReachTheNewcomer(t *testing.T) {
	for _, how := range []string{"shared", "rotated"} {
		t.Run(how, func(t *testing.T) {
			deps := newGroupTestDeps(t)
			defer deps.DB.Close()
			ts := httptest.NewServer(deps.GroupRouter)
			defer ts.Close()
			ctx := context.Background()

			g := newLiveGroup(t, deps, ts.URL, "keys"+how)
			newcomer := createUser(t, deps.UserRepo, uniqueGrpUsername("keysnew"), "user")
			_, err := deps.DB.Pool.Exec(ctx, `UPDATE users SET public_key = 'pk-' || id::text WHERE id IN (
				SELECT user_id FROM conversation_participants WHERE conversation_id = $1) OR id = $2`, g.id, newcomer.ID)
			require.NoError(t, err)
			var members []int
			rows, err := deps.DB.Pool.Query(ctx, `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`, g.id)
			require.NoError(t, err)
			for rows.Next() {
				var id int
				require.NoError(t, rows.Scan(&id))
				members = append(members, id)
			}
			rows.Close()
			copies := func(version int, ids []int) string {
				parts := make([]string, 0, len(ids))
				for _, id := range ids {
					parts = append(parts, fmt.Sprintf(`"%d":"v%d-%d"`, id, version, id))
				}
				return "{" + strings.Join(parts, ",") + "}"
			}
			w := doGroupRequest(t, deps.GroupRouter, http.MethodPost, fmt.Sprintf("/api/v1/groups/%d/keys", g.id), g.ownerToken,
				[]byte(fmt.Sprintf(`{"key_version":1,"copies":%s}`, copies(1, members))))
			require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

			conn := dialGroupSocket(t, deps, ts.URL, newcomer)
			w = doGroupRequest(t, deps.GroupRouter, http.MethodPost, fmt.Sprintf("/api/v1/groups/%d/participants", g.id), g.ownerToken,
				[]byte(fmt.Sprintf(`{"user_id":%d}`, newcomer.ID)))
			require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

			history := fmt.Sprintf(`{"1":{"%d":"v1-for-newcomer"}}`, newcomer.ID)
			if how == "shared" {
				w = doGroupRequest(t, deps.GroupRouter, http.MethodPost, fmt.Sprintf("/api/v1/groups/%d/keys/history", g.id), g.ownerToken,
					[]byte(fmt.Sprintf(`{"history":%s}`, history)))
				require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
			} else {
				w = doGroupRequest(t, deps.GroupRouter, http.MethodPost, fmt.Sprintf("/api/v1/groups/%d/keys", g.id), g.ownerToken,
					[]byte(fmt.Sprintf(`{"key_version":2,"copies":%s,"history":%s}`, copies(2, append(members, newcomer.ID)), history)))
				require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
			}

			evt := readWebSocketEvent(t, conn, 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "group_keys_shared" })
			payload, _ := evt["payload"].(map[string]interface{})
			assert.EqualValues(t, g.id, payload["conversation_id"])
		})
	}
}

// A pending invite counts on the invitee's Messages badge, and it appeared
// there only after their app next fetched its invites.
func TestGroupInviteReachesTheInvitee(t *testing.T) {
	deps := newGroupTestDeps(t)
	defer deps.DB.Close()
	ts := httptest.NewServer(deps.GroupRouter)
	defer ts.Close()

	g := newLiveGroup(t, deps, ts.URL, "invitee")
	invitee := createUser(t, deps.UserRepo, uniqueGrpUsername("invitee"), "user")
	conn := dialGroupSocket(t, deps, ts.URL, invitee)

	w := doGroupRequest(t, deps.GroupRouter, http.MethodPost,
		fmt.Sprintf("/api/v1/groups/%d/invites", g.id), g.ownerToken,
		[]byte(fmt.Sprintf(`{"user_id":%d}`, invitee.ID)))
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	evt := readWebSocketEvent(t, conn, 3*time.Second, func(e map[string]interface{}) bool { return e["type"] == "group_invite_received" })
	payload, _ := evt["payload"].(map[string]interface{})
	assert.EqualValues(t, g.id, payload["conversation_id"])
}
