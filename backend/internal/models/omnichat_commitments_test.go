package models

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCommitmentsRunInBothDirectionsAndSurfaceWhileOpen(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatCommitmentRepository(pool)
	fixture := seedMemoryFixture(t, pool, "commitboth")
	ctx := context.Background()

	hers, created, err := repo.Record(ctx, OmniChatCommitment{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID,
		Direction: OmniChatCommitmentHers, Summary: "I said I would tell him how it went",
	})
	require.NoError(t, err)
	require.True(t, created)
	require.True(t, hers.IsHers())

	theirs, created, err := repo.Record(ctx, OmniChatCommitment{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID,
		Direction: OmniChatCommitmentTheirs, Summary: "he owes me a rematch",
	})
	require.NoError(t, err)
	require.True(t, created)
	require.False(t, theirs.IsHers())

	// Both are outstanding, and the direction survives the round trip -- being
	// chased for something you are actually owed is a specific kind of galling.
	open, err := repo.Outstanding(ctx, fixture.personaID, fixture.userID, OmniChatMaxOpenCommitments)
	require.NoError(t, err)
	require.Len(t, open, 2)

	// Somebody else's promises are not hers to hold anyone to.
	none, err := repo.Outstanding(ctx, fixture.personaID, fixture.otherID, OmniChatMaxOpenCommitments)
	require.NoError(t, err)
	require.Empty(t, none)
}

// Extraction runs over a sliding window, so the same promise is read more than
// once. A character who believes she was promised the same thing four times is
// worse than one who missed it.
func TestRecordingTheSamePromiseTwiceHoldsItOnce(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatCommitmentRepository(pool)
	fixture := seedMemoryFixture(t, pool, "commitdupe")
	ctx := context.Background()

	promise := OmniChatCommitment{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID,
		Direction: OmniChatCommitmentTheirs, Summary: "he owes me a rematch",
	}

	first, created, err := repo.Record(ctx, promise)
	require.NoError(t, err)
	require.True(t, created)

	again, created, err := repo.Record(ctx, promise)
	require.NoError(t, err)
	require.False(t, created, "the second reading is the same promise, not another one")
	require.Equal(t, first.ID, again.ID)

	open, err := repo.Outstanding(ctx, fixture.personaID, fixture.userID, OmniChatMaxOpenCommitments)
	require.NoError(t, err)
	require.Len(t, open, 1)

	// The same words in the other direction are a different promise entirely.
	promise.Direction = OmniChatCommitmentHers
	_, created, err = repo.Record(ctx, promise)
	require.NoError(t, err)
	require.True(t, created)
}

func TestResolvingSettlesOnceAndOnlyFromOpen(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatCommitmentRepository(pool)
	fixture := seedMemoryFixture(t, pool, "commitresolve")
	ctx := context.Background()

	commitment, _, err := repo.Record(ctx, OmniChatCommitment{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID,
		Direction: OmniChatCommitmentTheirs, Summary: "he said he would post it",
	})
	require.NoError(t, err)

	broken, err := repo.Resolve(ctx, commitment.ID, OmniChatCommitmentBroken)
	require.NoError(t, err)
	require.Equal(t, OmniChatCommitmentBroken, broken.Status)
	require.NotNil(t, broken.ResolvedAt, "a settled commitment records when, or nobody can act on it")

	// Settled is settled. A second resolution would rewrite the ending.
	_, err = repo.Resolve(ctx, commitment.ID, OmniChatCommitmentKept)
	require.ErrorIs(t, err, ErrOmniChatCommitmentNotOpen)

	open, err := repo.Outstanding(ctx, fixture.personaID, fixture.userID, OmniChatMaxOpenCommitments)
	require.NoError(t, err)
	require.Empty(t, open, "a resolved commitment is history, not something she is carrying")

	// Released is neither kept nor broken, and must not be collapsed into either.
	second, _, err := repo.Record(ctx, OmniChatCommitment{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID,
		Direction: OmniChatCommitmentHers, Summary: "I said I would think about it",
	})
	require.NoError(t, err)
	released, err := repo.Resolve(ctx, second.ID, OmniChatCommitmentReleased)
	require.NoError(t, err)
	require.Equal(t, OmniChatCommitmentReleased, released.Status)

	// And 'open' is not a resolution.
	_, err = repo.Resolve(ctx, second.ID, OmniChatCommitmentOpen)
	require.Error(t, err)
}

func TestRecordRefusesAnUnusableCommitment(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatCommitmentRepository(pool)
	fixture := seedMemoryFixture(t, pool, "commitbad")
	ctx := context.Background()

	base := OmniChatCommitment{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID,
		Direction: OmniChatCommitmentHers, Summary: "something",
	}

	sideways := base
	sideways.Direction = "sideways"
	_, _, err := repo.Record(ctx, sideways)
	require.Error(t, err, "a direction that is neither hers nor theirs inverts who is owed")

	blank := base
	blank.Summary = "   "
	_, _, err = repo.Record(ctx, blank)
	require.Error(t, err)

	unowned := base
	unowned.OwnerUserID = 0
	_, _, err = repo.Record(ctx, unowned)
	require.Error(t, err, "a commitment always has somebody on the other end of it")
}

// Closing one wrongly is otherwise permanent, and the way it happens is
// specific: an exchange that discusses a promise without completing it reads as
// completing it. Nobody finds out, because the commitment simply stops
// appearing.
func TestAWronglySettledCommitmentCanBePutBack(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatCommitmentRepository(pool)
	fixture := seedMemoryFixture(t, pool, "commitreopen")
	ctx := context.Background()

	commitment, _, err := repo.Record(ctx, OmniChatCommitment{
		PersonaID: fixture.personaID, OwnerUserID: fixture.userID,
		Direction: OmniChatCommitmentTheirs, Summary: "he owes me a rematch",
	})
	require.NoError(t, err)

	_, err = repo.Resolve(ctx, commitment.ID, OmniChatCommitmentKept)
	require.NoError(t, err)

	// Settled, so it is invisible to the outstanding view and reachable only
	// through the settled one -- which is exactly why that view exists.
	open, err := repo.Outstanding(ctx, fixture.personaID, fixture.userID, OmniChatMaxOpenCommitments)
	require.NoError(t, err)
	require.Empty(t, open)

	settled, err := repo.RecentlySettled(ctx, fixture.personaID, fixture.userID, OmniChatMaxSettledCommitments)
	require.NoError(t, err)
	require.Len(t, settled, 1)
	require.Equal(t, commitment.ID, settled[0].ID)

	reopened, err := repo.Reopen(ctx, commitment.ID)
	require.NoError(t, err)
	require.Equal(t, OmniChatCommitmentOpen, reopened.Status)
	require.Nil(t, reopened.ResolvedAt, "an open commitment carries no ending")

	open, err = repo.Outstanding(ctx, fixture.personaID, fixture.userID, OmniChatMaxOpenCommitments)
	require.NoError(t, err)
	require.Len(t, open, 1, "she is carrying it again")

	// Reopening something already open is not an error to act on twice.
	_, err = repo.Reopen(ctx, commitment.ID)
	require.ErrorIs(t, err, ErrOmniChatCommitmentNotSettled)

	// And it can be settled again afterwards, which is the point of putting it
	// back rather than deleting the record.
	_, err = repo.Resolve(ctx, commitment.ID, OmniChatCommitmentBroken)
	require.NoError(t, err)
}
