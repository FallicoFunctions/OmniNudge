package services_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
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

// Rotation wraps the next key with each member's public key, so a member
// without one stops the group. Real members have published a key.
func publishTestPublicKey(t *testing.T, db *testutil.TestDatabase, userIDs ...int) {
	t.Helper()
	for _, id := range userIDs {
		_, err := db.Pool.Exec(context.Background(),
			`UPDATE users SET public_key = $1 WHERE id = $2`, fmt.Sprintf("public-key-for-%d", id), id)
		require.NoError(t, err)
	}
}

func memberIDs(members []services.GroupMember) []int {
	ids := make([]int, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	return ids
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
	publishTestPublicKey(t, db, owner.ID, member.ID)

	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, state.ActiveVersion, "a group with no key needs one before the next message")
	assert.Equal(t, 0, state.LatestVersion)
	assert.True(t, state.HistoryVisible, "a group with no settings row shows its history")
	assert.ElementsMatch(t, []int{owner.ID, member.ID}, memberIDs(state.Members))
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
	publishTestPublicKey(t, db, owner.ID, member.ID)

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
	publishTestPublicKey(t, db, owner.ID, member.ID)
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
	assert.ElementsMatch(t, []int{owner.ID}, memberIDs(state.Members), "the member who left gets no copy of the new version")

	_, err = svc.State(ctx, group, member.ID)
	assert.ErrorIs(t, err, services.ErrNotGroupMember)
}

// A member who never published a key cannot be given a copy, so the group
// cannot rotate at all. The sender must learn that, and not that its copies
// were wrong: the copies are exactly right, and the member is the problem.
func TestGroupKeyWaitsForAMemberWithNoPublicKey(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	member := fixtures.CreateUniqueUser("gk_member")
	group := newTestGroup(t, db, owner.ID, member.ID)
	publishTestPublicKey(t, db, owner.ID)

	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	keys := map[int]string{}
	for _, m := range state.Members {
		keys[m.UserID] = m.PublicKey
	}
	assert.Equal(t, fmt.Sprintf("public-key-for-%d", owner.ID), keys[owner.ID],
		"the state carries the key each copy must be wrapped with")
	assert.Empty(t, keys[member.ID], "and names the member who holds the group back")

	assert.ErrorIs(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID, member.ID),
	}), services.ErrGroupKeyNoPublicKey)

	publishTestPublicKey(t, db, member.ID)
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID, member.ID),
	}), "and the same rotation goes through once that member has a key")
}

// The bound on a stored copy must admit anything a publishable key can make.
// The publish path takes a public key of any size up to its own bound, and a
// large modulus wraps a 32-byte key to well over 2 KB. A copy the group
// refuses on size is a member who can never be given the key at all, and the
// refusal would name the copies, which are not the problem.
func TestGroupKeyCopyFitsAnyPublishableKey(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	member := fixtures.CreateUniqueUser("gk_member")
	group := newTestGroup(t, db, owner.ID, member.ID)
	publishTestPublicKey(t, db, owner.ID, member.ID)

	// Longer than the old 2 KB bound, shorter than a publishable key allows.
	wrapped := strings.Repeat("A", 3000)
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1,
		Copies:     map[int]string{owner.ID: wrapped, member.ID: wrapped},
	}))

	state, err := svc.State(ctx, group, member.ID)
	require.NoError(t, err)
	require.Len(t, state.MyCopies, 1)
	assert.Equal(t, wrapped, state.MyCopies[0].WrappedKey, "the copy is stored whole")
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
	publishTestPublicKey(t, db, owner.ID, member.ID, newcomer.ID)
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
	publishTestPublicKey(t, db, owner.ID, newcomer.ID)
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
	publishTestPublicKey(t, db, owner.ID, newcomer.ID, latecomer.ID)
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

// A rotation happens only at a join or a leave, and it was the only carrier of
// older copies. So a group that turned its history on after members had joined
// left them unable to read the earlier messages until somebody joined or left.
func TestGroupKeyHistoryCanBeSharedWhenTheGroupShowsItLater(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	svc := services.NewGroupKeyService(db.Pool)
	ctx := context.Background()

	owner := fixtures.CreateUniqueUser("gk_owner")
	member := fixtures.CreateUniqueUser("gk_member")
	outsider := fixtures.CreateUniqueUser("gk_outsider")
	group := newTestGroup(t, db, owner.ID)
	publishTestPublicKey(t, db, owner.ID, member.ID, outsider.ID)
	setTestGroupHistory(t, db, group, false)
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, owner.ID),
	}))
	joinTestGroup(t, db, group, member.ID, "member")
	require.NoError(t, svc.Rotate(ctx, group, owner.ID, &services.GroupKeyRotation{
		KeyVersion: 2, Copies: wrappedCopies(2, owner.ID, member.ID),
	}))
	share := map[int]map[int]string{1: {member.ID: "v1-wrapped-for-member"}}

	assert.ErrorIs(t, svc.ShareHistory(ctx, group, owner.ID, share), services.ErrGroupKeyHistory,
		"not while the history is hidden")

	setTestGroupHistory(t, db, group, true)
	state, err := svc.State(ctx, group, owner.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, state.ActiveVersion, "the key is current: no rotation is coming")
	assert.Equal(t, map[int][]int{member.ID: {1}}, state.MissingHistory)

	assert.ErrorIs(t, svc.ShareHistory(ctx, group, outsider.ID, share), services.ErrNotGroupMember)
	assert.ErrorIs(t, svc.ShareHistory(ctx, group, member.ID, map[int]map[int]string{1: {owner.ID: "x"}}),
		services.ErrGroupKeyHistory, "the owner lacks nothing, and the member does not hold version 1")

	require.NoError(t, svc.ShareHistory(ctx, group, owner.ID, share))
	state, err = svc.State(ctx, group, member.ID)
	require.NoError(t, err)
	require.Len(t, state.MyCopies, 2, "the member now reads what came before they joined")
	assert.Equal(t, "v1-wrapped-for-member", state.MyCopies[0].WrappedKey)
	assert.Empty(t, state.MissingHistory)

	assert.ErrorIs(t, svc.ShareHistory(ctx, group, owner.ID, share), services.ErrGroupKeyHistory,
		"a second copy of the same version is refused: nothing is missing any more")
}

// inTx runs one step of a membership change in its own transaction, as the
// handlers do.
func inTx(t *testing.T, db *testutil.TestDatabase, step func(tx pgx.Tx) error) error {
	t.Helper()
	ctx := context.Background()
	tx, err := db.Pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	if err := step(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func newTestInvite(t *testing.T, db *testutil.TestDatabase, conversationID, invitedID, inviterID int) int {
	t.Helper()
	var id int
	require.NoError(t, db.Pool.QueryRow(context.Background(), `
		INSERT INTO group_invites (conversation_id, invited_user_id, invited_by) VALUES ($1, $2, $3) RETURNING id
	`, conversationID, invitedID, inviterID).Scan(&id))
	return id
}

// A group with one key version, and someone outside it with a public key.
func groupWithHistory(t *testing.T, db *testutil.TestDatabase) (svc *services.GroupKeyService, group, owner, newcomer int) {
	t.Helper()
	fixtures := testutil.NewFixtures(t, db)
	svc = services.NewGroupKeyService(db.Pool)
	o := fixtures.CreateUniqueUser("gk_owner")
	m := fixtures.CreateUniqueUser("gk_member")
	n := fixtures.CreateUniqueUser("gk_newcomer")
	group = newTestGroup(t, db, o.ID, m.ID)
	publishTestPublicKey(t, db, o.ID, m.ID, n.ID)
	require.NoError(t, svc.Rotate(context.Background(), group, o.ID, &services.GroupKeyRotation{
		KeyVersion: 1, Copies: wrappedCopies(1, o.ID, m.ID),
	}))
	return svc, group, o.ID, n.ID
}

// A newcomer read nothing of the past until some older member happened to send
// a message after they joined.
func TestGroupKeyHistoryArrivesWithTheInvite(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	ctx := context.Background()
	svc, group, owner, newcomer := groupWithHistory(t, db)

	invite := newTestInvite(t, db, group, newcomer, owner)
	require.NoError(t, inTx(t, db, func(tx pgx.Tx) error {
		return services.StoreInviteHistory(ctx, tx, group, owner, invite, services.NewcomerHistory{1: "v1-for-newcomer"})
	}))
	require.NoError(t, inTx(t, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ($1, $2, 'member')
		`, group, newcomer); err != nil {
			return err
		}
		return services.GrantInviteHistory(ctx, tx, group, invite, newcomer)
	}))

	state, err := svc.State(ctx, group, newcomer)
	require.NoError(t, err)
	require.Len(t, state.MyCopies, 1, "the newcomer reads the history on joining, before anyone sends")
	assert.Equal(t, 1, state.MyCopies[0].KeyVersion)
	assert.Equal(t, "v1-for-newcomer", state.MyCopies[0].WrappedKey)
	assert.Empty(t, state.MissingHistory)

	var left int
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM group_invite_key_copies WHERE invite_id = $1`, invite).Scan(&left))
	assert.Zero(t, left, "an answered invite keeps no copies")
}

func TestGroupKeyHistoryFromAnInviteStaysShutIfTheGroupHidesItFirst(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	ctx := context.Background()
	svc, group, owner, newcomer := groupWithHistory(t, db)

	invite := newTestInvite(t, db, group, newcomer, owner)
	require.NoError(t, inTx(t, db, func(tx pgx.Tx) error {
		return services.StoreInviteHistory(ctx, tx, group, owner, invite, services.NewcomerHistory{1: "v1-for-newcomer"})
	}))
	setTestGroupHistory(t, db, group, false)
	joinTestGroup(t, db, group, newcomer, "member")
	require.NoError(t, inTx(t, db, func(tx pgx.Tx) error {
		return services.GrantInviteHistory(ctx, tx, group, invite, newcomer)
	}))

	state, err := svc.State(ctx, group, newcomer)
	require.NoError(t, err)
	assert.Empty(t, state.MyCopies)
}

func TestGroupKeyHistoryForANewcomerFollowsTheRules(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	ctx := context.Background()
	_, group, owner, newcomer := groupWithHistory(t, db)
	invite := newTestInvite(t, db, group, newcomer, owner)

	for name, history := range map[string]services.NewcomerHistory{
		"a version the inviter does not hold": {2: "v2-for-newcomer"},
		"an empty copy":                       {1: ""},
	} {
		t.Run(name, func(t *testing.T) {
			err := inTx(t, db, func(tx pgx.Tx) error {
				return services.StoreInviteHistory(ctx, tx, group, owner, invite, history)
			})
			assert.ErrorIs(t, err, services.ErrGroupKeyHistory)
		})
	}

	setTestGroupHistory(t, db, group, false)
	err := inTx(t, db, func(tx pgx.Tx) error {
		return services.StoreInviteHistory(ctx, tx, group, owner, invite, services.NewcomerHistory{1: "v1-for-newcomer"})
	})
	assert.ErrorIs(t, err, services.ErrGroupKeyHistory, "a group that hides its history sends none")
}

func TestGroupKeyHistoryArrivesWithADirectAdd(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	ctx := context.Background()
	svc, group, owner, newcomer := groupWithHistory(t, db)

	require.NoError(t, inTx(t, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ($1, $2, 'member')
		`, group, newcomer); err != nil {
			return err
		}
		return services.GrantAddedMemberHistory(ctx, tx, group, owner, newcomer, services.NewcomerHistory{1: "v1-for-newcomer"})
	}))

	state, err := svc.State(ctx, group, newcomer)
	require.NoError(t, err)
	require.Len(t, state.MyCopies, 1)
	assert.Equal(t, "v1-for-newcomer", state.MyCopies[0].WrappedKey)
}
