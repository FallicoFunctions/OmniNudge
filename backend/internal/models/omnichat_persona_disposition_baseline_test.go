package models

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Effective disposition is the authored baseline plus everything that has since
// happened, and the sum is held to the scale the wording can express.
func TestBaselinePlusDriftComposesAndClampsBothWays(t *testing.T) {
	now := time.Now()
	baseline := OmniChatDispositionBaseline{Mood: -0.3, Trust: -0.6, Warmth: 0.4, Derived: true}
	self := OmniChatCharacterTraits{Mood: -0.2, MoodUpdatedAt: now, Trust: -0.5, Warmth: 0.3}
	relationship := OmniChatCharacterTraits{Mood: -0.1, MoodUpdatedAt: now, Trust: -0.3, Warmth: 0.5}

	composed := ComposeOmniChatDisposition(baseline, self, relationship, now)

	require.InDelta(t, -0.6, composed.Mood, 1e-9)
	require.InDelta(t, -1, composed.Trust, 1e-9, "the sum clamps at the bottom of the scale")
	require.InDelta(t, 1, composed.Warmth, 1e-9, "and at the top of it")

	// The other direction of the clamp, from the other side of the scale.
	sunny := ComposeOmniChatDisposition(
		OmniChatDispositionBaseline{Mood: 0.8, Derived: true},
		OmniChatCharacterTraits{Mood: 0.9, MoodUpdatedAt: now},
		OmniChatCharacterTraits{MoodUpdatedAt: now},
		now,
	)
	require.InDelta(t, 1, sunny.Mood, 1e-9)
}

// A character with no baseline is the character that existed before baselines
// did: the composition must be indistinguishable from the old two-tier sum.
func TestNoBaselineComposesExactlyAsBefore(t *testing.T) {
	now := time.Now()
	self := OmniChatCharacterTraits{Mood: -0.4, MoodUpdatedAt: now, Trust: -0.2, Warmth: 0.1}
	relationship := OmniChatCharacterTraits{Mood: 0.1, MoodUpdatedAt: now, Trust: 0.3, Warmth: -0.2}

	composed := ComposeOmniChatDisposition(OmniChatDispositionBaseline{}, self, relationship, now)

	require.InDelta(t, -0.3, composed.Mood, 1e-9)
	require.InDelta(t, 0.1, composed.Trust, 1e-9)
	require.InDelta(t, -0.1, composed.Warmth, 1e-9)
}

// The mood a character comes back to is her own. What decays is what happened
// to her, and what is left when it has gone is the card.
func TestMoodSettlesOnTheBaselineRatherThanOnZero(t *testing.T) {
	start := time.Now()
	baseline := OmniChatDispositionBaseline{Mood: -0.5, Derived: true}
	elated := OmniChatCharacterTraits{Mood: 0.9, MoodUpdatedAt: start}

	immediately := ComposeOmniChatSelfDisposition(baseline, elated, start)
	require.InDelta(t, 0.4, immediately.Mood, 1e-9, "good news lifts her out of it")

	aWeek := ComposeOmniChatSelfDisposition(baseline, elated, start.Add(7*24*time.Hour))
	require.Less(t, aWeek.Mood, 0.0, "and a week later it has worn off")

	aYear := ComposeOmniChatSelfDisposition(baseline, elated, start.Add(365*24*time.Hour))
	require.InDelta(t, -0.5, aYear.Mood, 1e-6, "leaving her where she was written")

	// And the neutral character still settles on nothing, which is what the
	// decay meant before any of this.
	neutral := ComposeOmniChatSelfDisposition(OmniChatDispositionBaseline{}, elated, start.Add(365*24*time.Hour))
	require.InDelta(t, 0, neutral.Mood, 1e-6)
	require.Greater(t, math.Abs(aYear.Mood), math.Abs(neutral.Mood))
}

func TestBaselineStorageIsIdempotentAndForceReDerives(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "baselineidem")
	personas := NewBotPersonaRepository(pool)
	ctx := context.Background()

	stored, err := personas.SetOmniChatDispositionBaseline(ctx, fixture.personaID,
		OmniChatDispositionBaseline{Mood: -0.3, Trust: -0.5, Warmth: 0.2, Derived: true}, false)
	require.NoError(t, err)
	require.True(t, stored)

	// A second run must not spend a write, and must not move what is there.
	again, err := personas.SetOmniChatDispositionBaseline(ctx, fixture.personaID,
		OmniChatDispositionBaseline{Mood: 0.9, Trust: 0.9, Warmth: 0.9, Derived: true}, false)
	require.NoError(t, err)
	require.False(t, again)

	baseline, err := personas.LoadOmniChatDispositionBaseline(ctx, fixture.personaID)
	require.NoError(t, err)
	require.InDelta(t, -0.3, baseline.Mood, 1e-6)
	require.InDelta(t, -0.5, baseline.Trust, 1e-6)
	require.True(t, baseline.Derived)

	forced, err := personas.SetOmniChatDispositionBaseline(ctx, fixture.personaID,
		OmniChatDispositionBaseline{Mood: 0.1, Trust: 0.2, Warmth: 0.3, Derived: true}, true)
	require.NoError(t, err)
	require.True(t, forced)

	baseline, err = personas.LoadOmniChatDispositionBaseline(ctx, fixture.personaID)
	require.NoError(t, err)
	require.InDelta(t, 0.1, baseline.Mood, 1e-6)
	require.InDelta(t, 0.2, baseline.Trust, 1e-6)
	require.InDelta(t, 0.3, baseline.Warmth, 1e-6)
}

func TestBaselineStorageRefusesValuesOutsideTheScale(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "baselinerange")
	personas := NewBotPersonaRepository(pool)
	ctx := context.Background()

	for _, out := range []OmniChatDispositionBaseline{
		{Mood: -1.4, Derived: true},
		{Trust: 3.2, Derived: true},
		{Warmth: -2, Derived: true},
	} {
		stored, err := personas.SetOmniChatDispositionBaseline(ctx, fixture.personaID, out, false)
		require.Error(t, err)
		require.False(t, stored)
	}

	baseline, err := personas.LoadOmniChatDispositionBaseline(ctx, fixture.personaID)
	require.NoError(t, err)
	require.False(t, baseline.Derived, "a refused derivation must leave the character underived")
}

// The two are kept apart so that deriving a baseline -- at any point in a
// character's life -- costs her nothing of what she has lived.
func TestStoringABaselineLeavesDriftAlone(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "baselinedrift")
	personas := NewBotPersonaRepository(pool)
	traits := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	require.NoError(t, traits.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, -0.9))
	before, err := traits.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Less(t, before.Trust, 0.0)

	stored, err := personas.SetOmniChatDispositionBaseline(ctx, fixture.personaID,
		OmniChatDispositionBaseline{Mood: -0.2, Trust: 0.6, Warmth: 0.5, Derived: true}, false)
	require.NoError(t, err)
	require.True(t, stored)

	after, err := traits.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Equal(t, before.Trust, after.Trust, "an authored baseline is not something that happened to her")
	require.Equal(t, before.Warmth, after.Warmth)
	require.Equal(t, before.Mood, after.Mood)

	// And the read composes the two rather than choosing between them.
	baseline, self, relationship, err := traits.LoadForConversation(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.True(t, baseline.Derived)
	require.InDelta(t, 0.6, baseline.Trust, 1e-6)
	composed := ComposeOmniChatDisposition(baseline, self, relationship, time.Now())
	require.InDelta(t, 0.6+float64(after.Trust), composed.Trust, 1e-6)
}

func TestListPlatformPersonasForBaselineSkipsWhatIsAlreadyDerived(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "baselinelist")
	personas := NewBotPersonaRepository(pool)
	ctx := context.Background()

	pending, err := personas.ListPlatformPersonasForBaseline(ctx, false, 0)
	require.NoError(t, err)
	require.True(t, containsPersona(pending, fixture.personaID))

	stored, err := personas.SetOmniChatDispositionBaseline(ctx, fixture.personaID,
		OmniChatDispositionBaseline{Mood: 0.1, Trust: 0.1, Warmth: 0.1, Derived: true}, false)
	require.NoError(t, err)
	require.True(t, stored)

	pending, err = personas.ListPlatformPersonasForBaseline(ctx, false, 0)
	require.NoError(t, err)
	require.False(t, containsPersona(pending, fixture.personaID), "a derived character is not read again")

	forced, err := personas.ListPlatformPersonasForBaseline(ctx, true, 0)
	require.NoError(t, err)
	require.True(t, containsPersona(forced, fixture.personaID), "unless the operator asked for it")
}

// A user's own imported card is theirs, and is never read by the derivation.
func TestListPlatformPersonasForBaselineIgnoresUserOwnedCards(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "baselineowned")
	personas := NewBotPersonaRepository(pool)
	ctx := context.Background()

	var ownedID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, owner_user_id)
		VALUES ('baseline-owned-card', 'Owned', 'You are Owned.', $1)
		RETURNING id
	`, fixture.userID).Scan(&ownedID))

	pending, err := personas.ListPlatformPersonasForBaseline(ctx, true, 0)
	require.NoError(t, err)
	require.False(t, containsPersona(pending, ownedID))

	stored, err := personas.SetOmniChatDispositionBaseline(ctx, ownedID,
		OmniChatDispositionBaseline{Mood: 0.1, Derived: true}, true)
	require.NoError(t, err)
	require.False(t, stored, "and the write refuses one even if it is aimed at directly")
}

func containsPersona(personas []*BotPersona, id int) bool {
	for _, persona := range personas {
		if persona != nil && persona.ID == id {
			return true
		}
	}
	return false
}
