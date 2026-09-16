//go:build integration

package integration

import (
	"encoding/json"
	"fmt"
	"net/http"
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

func TestGroupKeyRoutesOverHTTP(t *testing.T) {
	deps := newTestDeps(t)
	owner := createUser(t, deps.UserRepo, uniqueRLUsername("keyowner"), "user")
	member := createUser(t, deps.UserRepo, uniqueRLUsername("keymember"), "user")
	outsider := createUser(t, deps.UserRepo, uniqueRLUsername("keyoutsider"), "user")
	group := newGroupWithMembers(t, deps, owner.ID, member.ID)

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
	assert.ElementsMatch(t, []any{float64(owner.ID), float64(member.ID)}, state["members"])
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
