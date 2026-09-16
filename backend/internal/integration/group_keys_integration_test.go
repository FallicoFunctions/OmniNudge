//go:build integration

package integration

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A group as CreateGroup makes one: the owner, then the other members.
func newGroupWithMembers(t *testing.T, deps *TestDeps, ownerID int, memberIDs ...int) int {
	t.Helper()
	ctx := t.Context()
	var conversationID int
	require.NoError(t, deps.DB.Pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, is_group, group_name, created_by, max_participants, last_message_at)
		VALUES ('group', TRUE, 'key routes', $1, 250, CURRENT_TIMESTAMP)
		RETURNING id
	`, ownerID).Scan(&conversationID))
	for role, ids := range map[string][]int{"owner": {ownerID}, "member": memberIDs} {
		for _, id := range ids {
			_, err := deps.DB.Pool.Exec(ctx, `
				INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
				VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
			`, conversationID, id, role)
			require.NoError(t, err)
		}
	}
	return conversationID
}

// Rotation wraps the next key with each member's public key, so every member
// must have published one before the group can have a key at all.
func publishPublicKey(t *testing.T, deps *TestDeps, userIDs ...int) {
	t.Helper()
	for _, id := range userIDs {
		require.NoError(t, deps.UserRepo.UpdatePublicKey(t.Context(), id, fmt.Sprintf("public-key-for-%d", id)))
	}
}

// Every join and every leave ends the active version, so no message goes out
// under a key a newcomer lacks or a former member still holds.
func TestGroupMembershipChangesEndTheKeyVersion(t *testing.T) {
	deps := newTestDeps(t)
	owner := createUser(t, deps.UserRepo, uniqueRLUsername("hookowner"), "user")
	member := createUser(t, deps.UserRepo, uniqueRLUsername("hookmember"), "user")
	newcomer := createUser(t, deps.UserRepo, uniqueRLUsername("hooknewcomer"), "user")
	group := newGroupWithMembers(t, deps, owner.ID, member.ID)
	publishPublicKey(t, deps, owner.ID, member.ID, newcomer.ID)

	ownerToken, err := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	require.NoError(t, err)
	memberToken, err := deps.AuthService.GenerateJWT(member.ID, member.Username, member.Role)
	require.NoError(t, err)

	keysPath := fmt.Sprintf("/api/v1/groups/%d/keys", group)
	activeVersion := func(token string) float64 {
		t.Helper()
		w := sendAuthJSON(t, deps.Router, http.MethodGet, keysPath, nil, token)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		var state map[string]any
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &state))
		return state["active_version"].(float64)
	}
	storeVersion := func(version int, members ...int) {
		t.Helper()
		copies := map[string]string{}
		for _, id := range members {
			copies[fmt.Sprint(id)] = fmt.Sprintf("v%d-for-%d", version, id)
		}
		w := postAuthJSON(t, deps.Router, keysPath, map[string]any{
			"key_version": version, "copies": copies,
		}, ownerToken)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	}

	storeVersion(1, owner.ID, member.ID)
	require.Equal(t, float64(1), activeVersion(ownerToken))

	// A join.
	w := postAuthJSON(t, deps.Router, fmt.Sprintf("/api/v1/groups/%d/participants", group),
		map[string]any{"user_id": newcomer.ID}, ownerToken)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, float64(0), activeVersion(ownerToken), "a join ends the version")

	storeVersion(2, owner.ID, member.ID, newcomer.ID)
	require.Equal(t, float64(2), activeVersion(ownerToken))

	// A member removed by an admin.
	w = sendAuthJSON(t, deps.Router, http.MethodDelete,
		fmt.Sprintf("/api/v1/groups/%d/participants/%d", group, newcomer.ID), nil, ownerToken)
	require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	assert.Equal(t, float64(0), activeVersion(ownerToken), "a removal ends the version")

	storeVersion(3, owner.ID, member.ID)
	require.Equal(t, float64(3), activeVersion(ownerToken))

	// A member who leaves of their own accord.
	w = postAuthJSON(t, deps.Router, fmt.Sprintf("/api/v1/groups/%d/leave", group), map[string]any{}, memberToken)
	require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	assert.Equal(t, float64(0), activeVersion(ownerToken), "a leave ends the version")

	// A banned member: the ban removes them inside its own transaction, and the
	// version must end with it, or the group would keep sending under a key the
	// banned member still holds.
	banned := createUser(t, deps.UserRepo, uniqueRLUsername("hookbanned"), "user")
	publishPublicKey(t, deps, banned.ID)
	w = postAuthJSON(t, deps.Router, fmt.Sprintf("/api/v1/groups/%d/participants", group),
		map[string]any{"user_id": banned.ID}, ownerToken)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	storeVersion(4, owner.ID, banned.ID)
	require.Equal(t, float64(4), activeVersion(ownerToken))

	w = postAuthJSON(t, deps.Router, fmt.Sprintf("/api/v1/groups/%d/members/%d/ban", group, banned.ID),
		map[string]any{"reason": "spam", "delete_messages": false}, ownerToken)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, float64(0), activeVersion(ownerToken), "a ban ends the version")
}

func TestGroupKeyRoutesOverHTTP(t *testing.T) {
	deps := newTestDeps(t)
	owner := createUser(t, deps.UserRepo, uniqueRLUsername("keyowner"), "user")
	member := createUser(t, deps.UserRepo, uniqueRLUsername("keymember"), "user")
	outsider := createUser(t, deps.UserRepo, uniqueRLUsername("keyoutsider"), "user")
	group := newGroupWithMembers(t, deps, owner.ID, member.ID)
	publishPublicKey(t, deps, owner.ID, member.ID)

	ownerToken, err := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	require.NoError(t, err)
	memberToken, err := deps.AuthService.GenerateJWT(member.ID, member.Username, member.Role)
	require.NoError(t, err)
	outsiderToken, err := deps.AuthService.GenerateJWT(outsider.ID, outsider.Username, outsider.Role)
	require.NoError(t, err)

	keysPath := fmt.Sprintf("/api/v1/groups/%d/keys", group)

	// A member with no key version yet learns that the group needs one.
	w := sendAuthJSON(t, deps.Router, http.MethodGet, keysPath, nil, ownerToken)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var state map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &state))
	assert.Equal(t, float64(0), state["active_version"])
	assert.Equal(t, true, state["history_visible"])
	members, ok := state["members"].([]any)
	require.True(t, ok)
	ids := []any{}
	for _, m := range members {
		entry, ok := m.(map[string]any)
		require.True(t, ok)
		ids = append(ids, entry["user_id"])
		assert.NotEmpty(t, entry["public_key"], "the sender wraps the next key with these")
	}
	assert.ElementsMatch(t, []any{float64(owner.ID), float64(member.ID)}, ids)
	assert.Empty(t, state["my_copies"])

	// Nobody outside the group may read the state or store a version.
	assert.Equal(t, http.StatusForbidden,
		sendAuthJSON(t, deps.Router, http.MethodGet, keysPath, nil, outsiderToken).Code)
	assert.Equal(t, http.StatusForbidden, postAuthJSON(t, deps.Router, keysPath, map[string]any{
		"key_version": 1,
		"copies":      map[string]string{fmt.Sprint(owner.ID): "v1-for-owner"},
	}, outsiderToken).Code)

	// Copies must cover exactly the members, and the version must be the next one.
	assert.Equal(t, http.StatusBadRequest, postAuthJSON(t, deps.Router, keysPath, map[string]any{
		"key_version": 1,
		"copies":      map[string]string{fmt.Sprint(owner.ID): "v1-for-owner"},
	}, ownerToken).Code, "a copy for every member, or none at all")
	assert.Equal(t, http.StatusConflict, postAuthJSON(t, deps.Router, keysPath, map[string]any{
		"key_version": 2,
		"copies": map[string]string{
			fmt.Sprint(owner.ID):  "v2-for-owner",
			fmt.Sprint(member.ID): "v2-for-member",
		},
	}, ownerToken).Code)

	w = postAuthJSON(t, deps.Router, keysPath, map[string]any{
		"key_version": 1,
		"copies": map[string]string{
			fmt.Sprint(owner.ID):  "v1-for-owner",
			fmt.Sprint(member.ID): "v1-for-member",
		},
	}, ownerToken)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	// The second member reads its own copy, and only its own.
	w = sendAuthJSON(t, deps.Router, http.MethodGet, keysPath, nil, memberToken)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &state))
	assert.Equal(t, float64(1), state["active_version"])
	copies, ok := state["my_copies"].([]any)
	require.True(t, ok)
	require.Len(t, copies, 1)
	assert.Equal(t, map[string]any{"key_version": float64(1), "wrapped_key": "v1-for-member"}, copies[0])
	assert.NotContains(t, w.Body.String(), "v1-for-owner", "a member never sees another member's copy")

	// While the current version still fits the members, there is no next one.
	assert.Equal(t, http.StatusConflict, postAuthJSON(t, deps.Router, keysPath, map[string]any{
		"key_version": 2,
		"copies": map[string]string{
			fmt.Sprint(owner.ID):  "v2-for-owner",
			fmt.Sprint(member.ID): "v2-for-member",
		},
	}, memberToken).Code)
}

// The client tells one refusal from another by the code, because three of them
// share a 409 and the message is for people. That is a contract in two
// languages: these assert the bytes the server actually sends, so a rename on
// either side cannot pass unnoticed with both suites still green.
func TestGroupKeyRefusalsCarryTheirOwnCode(t *testing.T) {
	deps := newTestDeps(t)
	owner := createUser(t, deps.UserRepo, uniqueRLUsername("codeowner"), "user")
	member := createUser(t, deps.UserRepo, uniqueRLUsername("codemember"), "user")
	newcomer := createUser(t, deps.UserRepo, uniqueRLUsername("codenewcomer"), "user")
	group := newGroupWithMembers(t, deps, owner.ID, member.ID)
	publishPublicKey(t, deps, owner.ID)

	token, err := deps.AuthService.GenerateJWT(owner.ID, owner.Username, owner.Role)
	require.NoError(t, err)
	keys := fmt.Sprintf("/api/v1/groups/%d/keys", group)

	codeOf := func(w *httptest.ResponseRecorder) string {
		t.Helper()
		var body map[string]any
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body), w.Body.String())
		code, _ := body["code"].(string)
		return code
	}
	rotate := func(version int, ids ...int) *httptest.ResponseRecorder {
		copies := map[string]string{}
		for _, id := range ids {
			copies[fmt.Sprint(id)] = fmt.Sprintf("v%d-for-%d", version, id)
		}
		return postAuthJSON(t, deps.Router, keys, map[string]any{
			"key_version": version, "copies": copies,
		}, token)
	}

	// A member who has published no key: the sender can do nothing about it.
	w := rotate(1, owner.ID, member.ID)
	require.Equal(t, http.StatusConflict, w.Code, w.Body.String())
	assert.Equal(t, "group_key_member_not_set_up", codeOf(w))

	publishPublicKey(t, deps, member.ID, newcomer.ID)

	// Copies that do not cover the members.
	w = rotate(1, owner.ID)
	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
	assert.Equal(t, "group_key_copies_mismatch", codeOf(w))

	w = rotate(1, owner.ID, member.ID)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	// A key that is already current.
	w = rotate(2, owner.ID, member.ID)
	require.Equal(t, http.StatusConflict, w.Code, w.Body.String())
	assert.Equal(t, "group_key_current", codeOf(w))

	// A join ends the version, so the next one must be the next number.
	w = postAuthJSON(t, deps.Router, fmt.Sprintf("/api/v1/groups/%d/participants", group),
		map[string]any{"user_id": newcomer.ID}, token)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	w = rotate(9, owner.ID, member.ID, newcomer.ID)
	require.Equal(t, http.StatusConflict, w.Code, w.Body.String())
	assert.Equal(t, "group_key_version_taken", codeOf(w))
}
