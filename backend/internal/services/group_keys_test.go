package services_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A group as CreateGroup makes one: the owner plus the given members.
func newTestGroup(t *testing.T, db *testutil.TestDatabase, ownerID int, memberIDs ...int) int {
	t.Helper()
	ctx := context.Background()
	var conversationID int
	err := db.Pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, is_group, group_name, created_by, max_participants, last_message_at)
		VALUES ('group', TRUE, 'key test', $1, 250, CURRENT_TIMESTAMP)
		RETURNING id
	`, ownerID).Scan(&conversationID)
	require.NoError(t, err)
	joinTestGroup(t, db, conversationID, ownerID, "owner")
	for _, member := range memberIDs {
		joinTestGroup(t, db, conversationID, member, "member")
	}
	return conversationID
}

func joinTestGroup(t *testing.T, db *testutil.TestDatabase, conversationID, userID int, role string) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
	`, conversationID, userID, role)
	require.NoError(t, err)
	require.NoError(t, services.MarkGroupKeyStale(context.Background(), db.Pool, conversationID))
}

func leaveTestGroup(t *testing.T, db *testutil.TestDatabase, conversationID, userID int) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(), `
		DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, userID)
	require.NoError(t, err)
	require.NoError(t, services.MarkGroupKeyStale(context.Background(), db.Pool, conversationID))
}

func setTestGroupHistory(t *testing.T, db *testutil.TestDatabase, conversationID int, visible bool) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO group_settings (conversation_id, message_history_visible)
		VALUES ($1, $2)
		ON CONFLICT (conversation_id) DO UPDATE SET message_history_visible = EXCLUDED.message_history_visible
	`, conversationID, visible)
	require.NoError(t, err)
}

// What a member's client sends: the key wrapped with each member's public key.
func wrappedCopies(version int, members ...int) map[int]string {
	copies := map[int]string{}
	for _, member := range members {
		copies[member] = fmt.Sprintf("v%d-wrapped-for-%d", version, member)
	}
	return copies
}

func TestGroupKeyFirstVersionGoesToEveryMember(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	member := fixtures.CreateUniqueUser("gk_member")
	group := newTestGroup(t, db, owner.ID, member.ID)

	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, state.ActiveVersion, "a group with no key needs one before the next message")
	assert.Equal(t, 0, state.LatestVersion)
	assert.True(t, state.HistoryVisible, "a group with no settings row shows its history")
	assert.ElementsMatch(t, []int{owner.ID, member.ID}, state.Members)
	assert.Empty(t, state.MyCopies)

	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1,
		Copies:     wrappedCopies(1, owner.ID, member.ID),
	}))

	state, err = svc.State(ctx, group, member.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, state.ActiveVersion)
	require.Len(t, state.MyCopies, 1, "each member gets its own copy, and only its own")
	assert.Equal(t, 1, state.MyCopies[0].KeyVersion)
	assert.Equal(t, fmt.Sprintf("v1-wrapped-for-%d", member.ID), state.MyCopies[0].WrappedKey)
}

func TestGroupKeyCopiesMustMatchTheMembers(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	member := fixtures.CreateUniqueUser("gk_member")
	outsider := fixtures.CreateUniqueUser("gk_outsider")
	group := newTestGroup(t, db, owner.ID, member.ID)

	refused := []*services.GroupKeyRotation{
		{KeyVersion: 1, Copies: wrappedCopies(1, owner.ID)},
		{KeyVersion: 1, Copies: wrappedCopies(1, owner.ID, member.ID, outsider.ID)},
		{KeyVersion: 1, Copies: map[int]string{owner.ID: "v1-wrapped-for-owner", member.ID: ""}},
	}
	for _, rotation := range refused {
		assert.ErrorIs(t, svc.Rotate(ctx, group, owner.ID, rotation), services.ErrGroupKeyCopies)
	}

	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, state.LatestVersion, "a refused rotation stores nothing")
}

func TestGroupKeyVersionsFollowOneAnotherAndOnlyWhenStale(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	member := fixtures.CreateUniqueUser("gk_member")
	group := newTestGroup(t, db, owner.ID, member.ID)
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID, member.ID),
	}))

	assert.ErrorIs(t, svc.Rotate(ctx, group, member.ID, &services.GroupKeyRotation{
		KeyVersion: 2, Copies: wrappedCopies(2, owner.ID, member.ID),
	}), services.ErrGroupKeyCurrent, "no new version while the current one still fits the members")

	leaveTestGroup(t, db, group, member.ID)
	assert.ErrorIs(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 3, Copies: wrappedCopies(3, owner.ID),
	}), services.ErrGroupKeyVersion, "versions follow one another")

	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 2, Copies: wrappedCopies(2, owner.ID),
	}))
	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, state.ActiveVersion)
	assert.ElementsMatch(t, []int{owner.ID}, state.Members, "the member who left gets no copy of the new version")

	_, err = svc.State(ctx, group, member.ID)
	assert.ErrorIs(t, err, services.ErrNotGroupMember)
}

func TestGroupKeyIsClosedToNonMembers(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	outsider := fixtures.CreateUniqueUser("gk_outsider")
	group := newTestGroup(t, db, owner.ID)

	_, err := svc.State(ctx, group, outsider.ID)
	assert.ErrorIs(t, err, services.ErrNotGroupMember)
	assert.ErrorIs(t, svc.Rotate(ctx, group, outsider.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID),
	}), services.ErrNotGroupMember)
}

func TestGroupKeyHistoryReachesANewMemberWhenTheGroupShowsIt(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	member := fixtures.CreateUniqueUser("gk_member")
	newcomer := fixtures.CreateUniqueUser("gk_newcomer")
	group := newTestGroup(t, db, owner.ID, member.ID)
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID, member.ID),
	}))

	joinTestGroup(t, db, group, newcomer.ID, "member")
	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, state.ActiveVersion, "the join ended the old version")
	assert.Equal(t, map[int][]int{newcomer.ID: {1}}, state.MissingHistory)

	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 2,
		Copies:     wrappedCopies(2, owner.ID, member.ID, newcomer.ID),
		History:    map[int]map[int]string{1: {newcomer.ID: "v1-wrapped-for-newcomer"}},
	}))

	state, err = svc.State(ctx, group, newcomer.ID)
	require.NoError(t, err)
	require.Len(t, state.MyCopies, 2, "the newcomer reads the history too")
	assert.Equal(t, 1, state.MyCopies[0].KeyVersion)
	assert.Equal(t, "v1-wrapped-for-newcomer", state.MyCopies[0].WrappedKey)
	assert.Equal(t, 2, state.MyCopies[1].KeyVersion)
	assert.Empty(t, state.MissingHistory)
}

func TestGroupKeyHistoryStaysShutWhenTheGroupHidesIt(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	newcomer := fixtures.CreateUniqueUser("gk_newcomer")
	group := newTestGroup(t, db, owner.ID)
	setTestGroupHistory(t, db, group, false)
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID),
	}))

	joinTestGroup(t, db, group, newcomer.ID, "member")
	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	assert.False(t, state.HistoryVisible)
	assert.Empty(t, state.MissingHistory, "a hidden history asks for no older copies")

	assert.ErrorIs(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 2,
		Copies:     wrappedCopies(2, owner.ID, newcomer.ID),
		History:    map[int]map[int]string{1: {newcomer.ID: "v1-wrapped-for-newcomer"}},
	}), services.ErrGroupKeyHistory)

	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 2, Copies: wrappedCopies(2, owner.ID, newcomer.ID),
	}))
	state, err = svc.State(ctx, group, newcomer.ID)
	require.NoError(t, err)
	require.Len(t, state.MyCopies, 1, "the newcomer reads only what was sent after the join")
	assert.Equal(t, 2, state.MyCopies[0].KeyVersion)
}

func TestGroupKeyHistoryNeedsAVersionTheSenderHolds(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	newcomer := fixtures.CreateUniqueUser("gk_newcomer")
	latecomer := fixtures.CreateUniqueUser("gk_latecomer")
	group := newTestGroup(t, db, owner.ID)
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID),
	}))

	// The newcomer joins without the older version, then the latecomer joins.
	joinTestGroup(t, db, group, newcomer.ID, "member")
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 2, Copies: wrappedCopies(2, owner.ID, newcomer.ID),
	}))
	joinTestGroup(t, db, group, latecomer.ID, "member")

	assert.ErrorIs(t, svc.Rotate(ctx, group, newcomer.ID, &services.GroupKeyRotation{
		KeyVersion: 3,
		Copies:     wrappedCopies(3, owner.ID, newcomer.ID, latecomer.ID),
		History:    map[int]map[int]string{1: {latecomer.ID: "v1-wrapped-for-latecomer"}},
	}), services.ErrGroupKeyHistory, "a member cannot hand on a version it never had")
}
