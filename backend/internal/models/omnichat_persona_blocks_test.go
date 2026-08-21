package models

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Escalation happens across blocks, not within one. Each rung is reached by
// coming back after the last had lapsed and giving her a fresh reason.
func TestOmniChatBlockLadderEscalatesAndStopsAtIndefinite(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockladder")
	ctx := context.Background()

	lapse := func() {
		_, err := pool.Exec(ctx, `
			UPDATE omnichat_persona_user_blocks SET expires_at = now() - interval '1 second'
			WHERE persona_id = $1 AND user_id = $2 AND expires_at IS NOT NULL`,
			fixture.personaID, fixture.userID)
		require.NoError(t, err)
	}

	expected := []struct {
		tier    int16
		lasts   time.Duration
		forever bool
	}{
		{tier: 1, lasts: 10 * time.Minute},
		{tier: 2, lasts: 2 * time.Hour},
		{tier: 3, lasts: 24 * time.Hour},
		{tier: 4, forever: true},
	}

	for _, want := range expected {
		block, err := repo.Block(ctx, fixture.personaID, fixture.userID, "kept pushing after being told no")
		require.NoError(t, err)
		require.Equal(t, want.tier, block.Tier)

		if want.forever {
			require.Nil(t, block.ExpiresAt)
			require.True(t, block.IsIndefinite())
			continue
		}
		require.NotNil(t, block.ExpiresAt)
		require.False(t, block.IsIndefinite())
		require.WithinDuration(t, time.Now().Add(want.lasts), *block.ExpiresAt, time.Minute)
		lapse()
	}

	// Someone already shut out for good who does it again is still shut out for
	// good. The ladder stops rather than wrapping or failing.
	again, err := repo.Block(ctx, fixture.personaID, fixture.userID, "and again")
	require.NoError(t, err)
	require.Equal(t, OmniChatTopBlockTier, again.Tier)
	require.Nil(t, again.ExpiresAt)
}

// Somebody who cannot be heard cannot give a fresh reason, so a second call
// during a standing block would escalate on nothing. Without this, a retry, a
// redelivered job, or a loop in whatever comes to make these decisions walks a
// person from ten minutes to permanent in four calls having done nothing.
func TestOmniChatBlockDoesNotEscalateSomeoneAlreadyBlocked(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockstanding")
	ctx := context.Background()

	first, err := repo.Block(ctx, fixture.personaID, fixture.userID, "rude")
	require.NoError(t, err)
	require.Equal(t, int16(1), first.Tier)

	for i := 0; i < 3; i++ {
		again, err := repo.Block(ctx, fixture.personaID, fixture.userID, "called again by mistake")
		require.NoError(t, err)
		require.Equal(t, first.ID, again.ID, "the standing block is returned, not a new rung")
		require.Equal(t, int16(1), again.Tier)
	}

	var rows int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_persona_user_blocks WHERE persona_id = $1 AND user_id = $2`,
		fixture.personaID, fixture.userID).Scan(&rows))
	require.Equal(t, 1, rows, "no row is written while a block already stands")

	// Once it has lapsed, coming back and offending again does escalate.
	_, err = pool.Exec(ctx,
		`UPDATE omnichat_persona_user_blocks SET expires_at = now() - interval '1 second' WHERE id = $1`,
		first.ID)
	require.NoError(t, err)

	second, err := repo.Block(ctx, fixture.personaID, fixture.userID, "came back and did it again")
	require.NoError(t, err)
	require.Equal(t, int16(2), second.Tier)
}

func TestOmniChatBlockLaddersPerPersonAndPerCharacter(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockscope")
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		_, err := repo.Block(ctx, fixture.personaID, fixture.userID, "repeatedly unpleasant")
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `
			UPDATE omnichat_persona_user_blocks SET expires_at = now() - interval '1 second'
			WHERE persona_id = $1 AND user_id = $2`, fixture.personaID, fixture.userID)
		require.NoError(t, err)
	}

	// A different person starts at the bottom. Someone else's history is not
	// theirs, which is the same rule the relationship traits follow.
	other, err := repo.Block(ctx, fixture.personaID, fixture.otherID, "first offence")
	require.NoError(t, err)
	require.Equal(t, int16(1), other.Tier)
}

func TestOmniChatBlockActiveIgnoresLapsedAndOverturned(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockactive")
	ctx := context.Background()

	none, err := repo.ActiveBlock(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Nil(t, none, "nobody is blocked before anything happens")

	block, err := repo.Block(ctx, fixture.personaID, fixture.userID, "rude")
	require.NoError(t, err)

	active, err := repo.ActiveBlock(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.NotNil(t, active)
	require.Equal(t, block.ID, active.ID)

	// Ten minutes later it is over, without anything having run.
	_, err = pool.Exec(ctx,
		`UPDATE omnichat_persona_user_blocks SET expires_at = now() - interval '1 second' WHERE id = $1`,
		block.ID)
	require.NoError(t, err)

	lapsed, err := repo.ActiveBlock(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Nil(t, lapsed, "a block ends by lapsing, with no sweeper involved")

	// An overturned block is out of force immediately, expiry notwithstanding.
	standing, err := repo.Block(ctx, fixture.personaID, fixture.userID, "still rude")
	require.NoError(t, err)
	_, err = repo.Overturn(ctx, standing.ID, fixture.otherID, "reviewed: not unfair to ask twice")
	require.NoError(t, err)

	after, err := repo.ActiveBlock(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Nil(t, after, "overturning takes effect at once, not at the original expiry")
}

// The point of the review. A block an admin judged unfair must not leave the
// person one rung further up: reversing it would otherwise only postpone its
// effect to the next time they said anything wrong.
func TestOmniChatOverturnedBlockDoesNotCountTowardEscalation(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockoverturn")
	ctx := context.Background()

	unfair, err := repo.Block(ctx, fixture.personaID, fixture.userID, "misread a joke")
	require.NoError(t, err)
	require.Equal(t, int16(1), unfair.Tier)

	_, err = repo.Overturn(ctx, unfair.ID, fixture.otherID, "reviewed: this was not an offence")
	require.NoError(t, err)

	next, err := repo.Block(ctx, fixture.personaID, fixture.userID, "a genuine first offence")
	require.NoError(t, err)
	require.Equal(t, int16(1), next.Tier,
		"the overturned block is off the ladder, so this starts at the bottom")

	// And the reversal is recorded rather than erased, because that record is
	// what the review reads.
	history, total, err := repo.ListForAdmin(ctx, nil, 10, 0)
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Len(t, history, 2)

	var found bool
	for _, entry := range history {
		if entry.ID != unfair.ID {
			continue
		}
		found = true
		require.NotNil(t, entry.OverturnedAt)
		require.NotNil(t, entry.OverturnedBy)
		require.Equal(t, fixture.otherID, *entry.OverturnedBy)
		require.NotNil(t, entry.OverturnNote)
	}
	require.True(t, found, "an overturned block stays in the review queue")
}

func TestOmniChatOverturnIsNotRepeatable(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blocktwice")
	ctx := context.Background()

	block, err := repo.Block(ctx, fixture.personaID, fixture.userID, "rude")
	require.NoError(t, err)

	_, err = repo.Overturn(ctx, block.ID, fixture.otherID, "reviewed")
	require.NoError(t, err)

	// A second overturn would rewrite who reversed it and when, losing the
	// record of the decision that was actually made.
	_, err = repo.Overturn(ctx, block.ID, fixture.userID, "reviewed again")
	require.ErrorIs(t, err, ErrOmniChatBlockNotFound)

	_, err = repo.Overturn(ctx, block.ID+9999, fixture.otherID, "no such block")
	require.ErrorIs(t, err, ErrOmniChatBlockNotFound)
}

func TestOmniChatBlockRequiresAReason(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockreason")

	// A block with no reason cannot be reviewed, only guessed at.
	_, err := repo.Block(context.Background(), fixture.personaID, fixture.userID, "")
	require.Error(t, err)
}
