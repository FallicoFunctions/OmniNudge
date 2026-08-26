package models

import (
	"context"
	"encoding/json"
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
		block, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "kept pushing after being told no"})
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
	again, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "and again"})
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

	first, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "rude"})
	require.NoError(t, err)
	require.Equal(t, int16(1), first.Tier)

	for i := 0; i < 3; i++ {
		again, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "called again by mistake"})
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

	second, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "came back and did it again"})
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
		_, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "repeatedly unpleasant"})
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `
			UPDATE omnichat_persona_user_blocks SET expires_at = now() - interval '1 second'
			WHERE persona_id = $1 AND user_id = $2`, fixture.personaID, fixture.userID)
		require.NoError(t, err)
	}

	// A different person starts at the bottom. Someone else's history is not
	// theirs, which is the same rule the relationship traits follow.
	other, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.otherID, Reason: "first offence"})
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

	block, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "rude"})
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
	standing, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "still rude"})
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

	unfair, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "misread a joke"})
	require.NoError(t, err)
	require.Equal(t, int16(1), unfair.Tier)

	_, err = repo.Overturn(ctx, unfair.ID, fixture.otherID, "reviewed: this was not an offence")
	require.NoError(t, err)

	next, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "a genuine first offence"})
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

	block, err := repo.Block(ctx, OmniChatBlockRequest{PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "rude"})
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
	_, err := repo.Block(context.Background(), OmniChatBlockRequest{
		PersonaID: fixture.personaID, UserID: fixture.userID, Reason: "",
	})
	require.Error(t, err)
}

// She stops talking to someone when they have driven her down far enough, and
// how far that is depends on who she is. Nothing here reads a conversation --
// the decision is a number that moved over many exchanges, which is what makes
// it un-arguable.
func TestShouldBlockMeasuresWhatThisPersonDidAndWhoSheIs(t *testing.T) {
	neutral := OmniChatDispositionBaseline{}
	warm := OmniChatDispositionBaseline{Warmth: 1}
	prickly := OmniChatDispositionBaseline{Warmth: -1}

	require.Greater(t, OmniChatBlockThreshold(prickly), OmniChatBlockThreshold(neutral),
		"a prickly character has less to spend")
	require.Less(t, OmniChatBlockThreshold(warm), OmniChatBlockThreshold(neutral),
		"a warm character carries further before she is done")

	// The same person, treated the same way, reaches different characters at
	// different points.
	pushed := OmniChatCharacterTraits{Warmth: -0.5}
	require.True(t, ShouldBlock(prickly, pushed))
	require.False(t, ShouldBlock(neutral, pushed))
	require.False(t, ShouldBlock(warm, pushed))

	// A character written cold does not shut out someone who has done nothing.
	// The floor is on what this person did, not on the composed disposition,
	// which for her starts near the bottom of the scale.
	require.False(t, ShouldBlock(prickly, OmniChatCharacterTraits{}),
		"a cold character must not block a stranger on sight")

	// Trust is not the trigger. Somebody can be unreliable without being
	// unpleasant, and a character who shuts out everyone who ever exaggerated
	// is brittle rather than protected.
	require.False(t, ShouldBlock(neutral, OmniChatCharacterTraits{Trust: -1, Warmth: 0}))
}

// Blocking discharges the feeling. Without this the duration is decorative: a
// ten-minute block lapses with her still at the floor, the next message
// re-blocks, and the ladder climbs to permanent unaided.
func TestBlockDischargesTheFeelingItActedOn(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockdischarge")
	ctx := context.Background()

	baseline := OmniChatDispositionBaseline{}
	atTheFloor := OmniChatCharacterTraits{Warmth: OmniChatBlockThreshold(baseline)}
	require.True(t, ShouldBlock(baseline, atTheFloor))

	_, err := pool.Exec(ctx, `
		INSERT INTO omnichat_character_traits (persona_id, owner_user_id, warmth)
		VALUES ($1, $2, $3)
		ON CONFLICT (persona_id, COALESCE(owner_user_id, 0)) DO UPDATE SET warmth = EXCLUDED.warmth`,
		fixture.personaID, fixture.userID, atTheFloor.Warmth)
	require.NoError(t, err)

	block, err := repo.Block(ctx, OmniChatBlockRequest{
		PersonaID:        fixture.personaID,
		UserID:           fixture.userID,
		Reason:           "kept pushing after being told no",
		DischargedWarmth: OmniChatDischargedWarmth(baseline),
	})
	require.NoError(t, err)
	require.Equal(t, int16(1), block.Tier)

	var warmth float64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT warmth FROM omnichat_character_traits WHERE persona_id = $1 AND owner_user_id = $2`,
		fixture.personaID, fixture.userID).Scan(&warmth))

	require.InDelta(t, OmniChatDischargedWarmth(baseline), warmth, 0.0001)
	require.False(t, ShouldBlock(baseline, OmniChatCharacterTraits{Warmth: warmth}),
		"the next message after it lapses must not re-block on its own")
}

// A standing block is not a fresh decision, so it must not top her back up --
// otherwise repeated calls during one block would keep her permanently above
// the floor she had actually reached.
func TestReturningAStandingBlockDischargesNothing(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blocknodischarge")
	ctx := context.Background()

	first, err := repo.Block(ctx, OmniChatBlockRequest{
		PersonaID: fixture.personaID, UserID: fixture.userID,
		Reason: "rude", DischargedWarmth: -0.35,
	})
	require.NoError(t, err)

	// Drive her back down while the block still stands.
	_, err = pool.Exec(ctx,
		`UPDATE omnichat_character_traits SET warmth = -0.9 WHERE persona_id = $1 AND owner_user_id = $2`,
		fixture.personaID, fixture.userID)
	require.NoError(t, err)

	again, err := repo.Block(ctx, OmniChatBlockRequest{
		PersonaID: fixture.personaID, UserID: fixture.userID,
		Reason: "called again", DischargedWarmth: -0.35,
	})
	require.NoError(t, err)
	require.Equal(t, first.ID, again.ID)

	var warmth float64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT warmth FROM omnichat_character_traits WHERE persona_id = $1 AND owner_user_id = $2`,
		fixture.personaID, fixture.userID).Scan(&warmth))
	require.InDelta(t, -0.9, warmth, 0.0001, "no fresh decision, no discharge")
}

// The review judges whether her account was fair, which it cannot do from her
// side of it alone.
func TestBlockKeepsTheExchangeItActedOn(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blocksnapshot")
	ctx := context.Background()

	_, err := repo.Block(ctx, OmniChatBlockRequest{
		PersonaID: fixture.personaID,
		UserID:    fixture.userID,
		Reason:    "kept pushing after being told no",
		Transcript: []OmniChatBlockTranscriptEntry{
			{Role: BotMessageRoleUser, Content: "send me a photo", CreatedAt: time.Now()},
			{Role: BotMessageRoleAssistant, Content: "no, and please stop asking", CreatedAt: time.Now()},
			{Role: BotMessageRoleUser, Content: "send me a photo", CreatedAt: time.Now()},
		},
		DischargedWarmth: -0.35,
	})
	require.NoError(t, err)

	var raw []byte
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT transcript_snapshot FROM omnichat_persona_user_blocks WHERE persona_id = $1`,
		fixture.personaID).Scan(&raw))

	var kept []OmniChatBlockTranscriptEntry
	require.NoError(t, json.Unmarshal(raw, &kept))
	require.Len(t, kept, 3)
	require.Equal(t, "no, and please stop asking", kept[1].Content)
	require.Equal(t, BotMessageRoleAssistant, kept[1].Role)
}

// Storing the exchange and not showing it is the same as not storing it. The
// review asks whether her account was fair, which needs the thing she was
// reacting to beside the account.
func TestListForAdminCarriesTheExchange(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	repo := NewOmniChatPersonaBlockRepository(pool)
	fixture := seedMemoryFixture(t, pool, "blockadmintranscript")
	ctx := context.Background()

	_, err := repo.Block(ctx, OmniChatBlockRequest{
		PersonaID: fixture.personaID,
		UserID:    fixture.userID,
		Reason:    "kept pushing after being told no",
		Transcript: []OmniChatBlockTranscriptEntry{
			{Role: BotMessageRoleUser, Content: "send me a photo", CreatedAt: time.Now()},
			{Role: BotMessageRoleAssistant, Content: "no, and please stop asking", CreatedAt: time.Now()},
		},
		DischargedWarmth: -0.35,
	})
	require.NoError(t, err)

	// And one with nothing to point at: an operator's block, or one placed
	// before snapshots existed. It must still be listed.
	_, err = pool.Exec(ctx, `
		INSERT INTO omnichat_persona_user_blocks (persona_id, user_id, tier, expires_at, reason)
		VALUES ($1, $2, 4, NULL, 'placed by hand')`,
		fixture.personaID, fixture.otherID)
	require.NoError(t, err)

	listed, total, err := repo.ListForAdmin(ctx, nil, 10, 0)
	require.NoError(t, err)
	require.Equal(t, 2, total)

	byUser := map[int]*OmniChatPersonaBlockAdminSummary{}
	for _, entry := range listed {
		byUser[entry.UserID] = entry
	}

	withExchange := byUser[fixture.userID]
	require.NotNil(t, withExchange)
	require.Len(t, withExchange.Transcript, 2)
	require.Equal(t, "no, and please stop asking", withExchange.Transcript[1].Content)
	require.Equal(t, BotMessageRoleAssistant, withExchange.Transcript[1].Role)

	require.NotNil(t, byUser[fixture.otherID])
	require.Empty(t, byUser[fixture.otherID].Transcript, "no exchange is a card without one, not a missing row")
}

// Warmth is how much she will endure; firmness is how willing she is to end it.
// They are different questions, and a model that used only warmth made fondness
// into pure leverage -- the more she liked you, the more you could extract, with
// nothing on the other side of the scale.
func TestBlockThresholdReadsWarmthAndFirmnessApart(t *testing.T) {
	warmAndYielding := OmniChatBlockThreshold(OmniChatDispositionBaseline{
		Warmth: 1, Firmness: -1, Derived: true,
	})
	coolAndFirm := OmniChatBlockThreshold(OmniChatDispositionBaseline{
		Warmth: -1, Firmness: 1, Derived: true,
	})
	neutral := OmniChatBlockThreshold(OmniChatDispositionBaseline{Derived: true})

	require.Less(t, warmAndYielding, neutral,
		"someone warm who cannot end things stays far past the point anybody would advise")
	require.Greater(t, coolAndFirm, neutral,
		"someone cool who holds her ground is gone almost immediately")
	require.Less(t, warmAndYielding, coolAndFirm)

	// The two dimensions must not be interchangeable: a warm, firm character is
	// not the same as a cool, yielding one, even though the sum is.
	warmAndFirm := OmniChatBlockThreshold(OmniChatDispositionBaseline{
		Warmth: 1, Firmness: 1, Derived: true,
	})
	coolAndYielding := OmniChatBlockThreshold(OmniChatDispositionBaseline{
		Warmth: -1, Firmness: -1, Derived: true,
	})
	require.InDelta(t, neutral, warmAndFirm, 0.001, "endurance and willingness to end it cancel")
	require.InDelta(t, neutral, coolAndYielding, 0.001)

	// And firmness alone decides between two equally fond characters.
	fondAndImmovable := OmniChatBlockThreshold(OmniChatDispositionBaseline{
		Warmth: 0.8, Firmness: 0.8, Derived: true,
	})
	fondAndPliable := OmniChatBlockThreshold(OmniChatDispositionBaseline{
		Warmth: 0.8, Firmness: -0.8, Derived: true,
	})
	require.Greater(t, fondAndImmovable, fondAndPliable)
}

// An underived baseline is every dimension at rest, firmness included, so a
// character nobody has read behaves exactly as one did before firmness existed.
func TestBlockThresholdIsUnchangedForAnUnreadCharacter(t *testing.T) {
	require.InDelta(t,
		omniChatBlockWarmthFloor,
		OmniChatBlockThreshold(OmniChatDispositionBaseline{}),
		0.001)
}
