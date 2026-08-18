package models

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestOmniChatCharacterTraitsMoodMovesWithValence(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitmood")
	repo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, -0.4))
	traits, err := repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Less(t, traits.Mood, 0.0, "a painful episode must lower the mood")

	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, 0.9))
	after, err := repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Greater(t, after.Mood, traits.Mood, "a joyful episode must raise the mood")
	require.Greater(t, after.Mood, 0.0)
}

// A mild episode colours the character's day and nothing more. Becoming warier
// takes something that actually hurt.
func TestOmniChatCharacterTraitsMildEpisodeLeavesTrustAlone(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitmild")
	repo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	mild := -(OmniChatTraitLastingThreshold - 0.1)
	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, mild))

	traits, err := repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Less(t, traits.Mood, 0.0)
	require.Zero(t, traits.Trust, "a mild episode must not change who the character is")
	require.Zero(t, traits.Warmth)
}

// Heartbreak recovers and a bad enough betrayal does not. Both time constants
// are exercised here against the same row: the mood fades away, the damage to
// trust is still there weeks later.
func TestOmniChatCharacterTraitsMoodDecaysAndTrustDoesNot(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitdecay")
	repo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, -0.95))
	traits, err := repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Less(t, traits.Mood, 0.0)
	require.Less(t, traits.Trust, 0.0, "a strongly painful episode must damage trust")
	require.Less(t, traits.Warmth, 0.0)

	wounded := traits.Trust
	now := traits.MoodUpdatedAt

	oneHalfLife := traits.MoodAt(now.Add(OmniChatTraitMoodHalfLife))
	require.InDelta(t, traits.Mood/2, oneHalfLife, 1e-6)

	// Toward 0, never past it: a foul mood does not turn into a good one by
	// being left alone.
	for _, elapsed := range []time.Duration{
		OmniChatTraitMoodHalfLife,
		7 * 24 * time.Hour,
		90 * 24 * time.Hour,
		365 * 24 * time.Hour,
	} {
		mood := traits.MoodAt(now.Add(elapsed))
		require.Less(t, mood, 0.0, "decay must approach zero without crossing it")
		require.Greater(t, mood, traits.Mood)
	}
	require.InDelta(t, 0, traits.MoodAt(now.Add(365*24*time.Hour)), 0.01)

	// Trust has no decay term at all, so the passage of time cannot return it.
	require.Equal(t, wounded, traits.Trust)
	reloaded, err := repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Equal(t, wounded, reloaded.Trust)
}

func TestOmniChatCharacterTraitsClampAtTheEndsOfTheScale(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitclamp")
	repo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	// Long enough that unbounded arithmetic would be well past -1.
	for i := 0; i < 60; i++ {
		require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, -1))
	}
	traits, err := repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.InDelta(t, -1, traits.Mood, 1e-6)
	require.InDelta(t, -1, traits.Trust, 1e-6)
	require.InDelta(t, -1, traits.Warmth, 1e-6)

	for i := 0; i < 120; i++ {
		require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, 1))
	}
	traits, err = repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.InDelta(t, 1, traits.Mood, 1e-6)
	require.InDelta(t, 1, traits.Trust, 1e-6)
	require.InDelta(t, 1, traits.Warmth, 1e-6)
}

// The rule that matters most: what one person did to a character is invisible
// to everyone else, and neither of them is the character's own life.
func TestOmniChatCharacterTraitsAreScopedToOneUser(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitscope")
	repo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, -0.9))

	theirs, err := repo.Load(ctx, fixture.personaID, fixture.otherID)
	require.NoError(t, err)
	require.Zero(t, theirs.Mood, "one user's cruelty must not follow the character to another user")
	require.Zero(t, theirs.Trust)
	require.Zero(t, theirs.Warmth)

	self, err := repo.Load(ctx, fixture.personaID, OmniChatMemoryTierSelf)
	require.NoError(t, err)
	require.Zero(t, self.Mood, "a private conversation must not move the shared self tier")
	require.Zero(t, self.Trust)

	// The self tier is its own row, and moving it leaves the relationships
	// where they were.
	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, OmniChatMemoryTierSelf, 0.9))
	self, err = repo.Load(ctx, fixture.personaID, OmniChatMemoryTierSelf)
	require.NoError(t, err)
	require.Greater(t, self.Mood, 0.0)

	mine, err := repo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Less(t, mine.Mood, 0.0, "the self tier must not overwrite a relationship")

	theirs, err = repo.Load(ctx, fixture.personaID, fixture.otherID)
	require.NoError(t, err)
	require.Zero(t, theirs.Mood)
}

// Deleting a character takes its dispositions with it, exactly as it takes its
// self-tier memory.
func TestOmniChatCharacterTraitsCascadeWithThePersona(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitcascade")
	repo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, -0.9))
	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, OmniChatMemoryTierSelf, 0.9))

	var rows int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_character_traits WHERE persona_id = $1`, fixture.personaID).Scan(&rows))
	require.Equal(t, 2, rows)

	_, err := pool.Exec(ctx, `DELETE FROM bot_personas WHERE id = $1`, fixture.personaID)
	require.NoError(t, err)

	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_character_traits WHERE persona_id = $1`, fixture.personaID).Scan(&rows))
	require.Zero(t, rows, "traits must not outlive the character they describe")
}

// Extraction is what feeds the relational tier, and it does it in the same
// transaction as the episodes, so the disposition and the memories behind it
// are written together or not at all.
func TestOmniChatRecordExtractionMovesRelationshipTraits(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitextract")
	memories := NewOmniChatMemoryRepository(pool)
	traitRepo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	require.NoError(t, memories.RecordExtraction(ctx, conversationID, fixture.userID, 0, 7, []OmniChatMemoryEpisode{{
		PersonaID:        fixture.personaID,
		OwnerUserID:      fixture.userID,
		ConversationID:   conversationID,
		Title:            "He said he never wanted to speak to her again",
		Summary:          "It ended badly and he meant it.",
		Salience:         0.9,
		Distinctiveness:  0.8,
		EmotionalValence: floatPtr(-0.9),
	}}))

	traits, err := traitRepo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Less(t, traits.Mood, 0.0)
	require.Less(t, traits.Trust, 0.0)

	// And it stayed in this relationship.
	theirs, err := traitRepo.Load(ctx, fixture.personaID, fixture.otherID)
	require.NoError(t, err)
	require.Zero(t, theirs.Mood)
	require.Zero(t, theirs.Trust)

	self, err := traitRepo.Load(ctx, fixture.personaID, OmniChatMemoryTierSelf)
	require.NoError(t, err)
	require.Zero(t, self.Trust)
}

// A losing racer rolls the whole extraction back, and the traits go with it.
func TestOmniChatRecordExtractionTraitsRollBackWithTheEpisodes(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitrollback")
	memories := NewOmniChatMemoryRepository(pool)
	traitRepo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))
	require.NoError(t, memories.SkipTo(ctx, conversationID, fixture.userID, 12))

	// fromMessageID no longer matches the watermark, so this extraction loses.
	err := memories.RecordExtraction(ctx, conversationID, fixture.userID, 0, 20, []OmniChatMemoryEpisode{{
		PersonaID:        fixture.personaID,
		OwnerUserID:      fixture.userID,
		ConversationID:   conversationID,
		Title:            "Something that never landed",
		Summary:          "The other worker got there first.",
		Salience:         0.5,
		Distinctiveness:  0.5,
		EmotionalValence: floatPtr(-0.9),
	}})
	require.ErrorIs(t, err, ErrOmniChatMemoryRaced)

	traits, err := traitRepo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)
	require.Zero(t, traits.Mood, "a discarded extraction must not leave a mark on the character")
	require.Zero(t, traits.Trust)
}

// The traits row is taken once, after every episode and entity in the
// extraction has been written, so it can never sit in the middle of a lock
// order the transcript chose. What that must not change is the result: every
// episode still lands on its own, and a batch is not a sum or an average of
// one.
func TestOmniChatRecordExtractionAppliesEachEpisodeInTheBatch(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitbatch")
	memories := NewOmniChatMemoryRepository(pool)
	traitRepo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	var conversationID int
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO bot_conversations (user_id, persona_id) VALUES ($1, $2) RETURNING id`,
		fixture.userID, fixture.personaID).Scan(&conversationID))

	const cruel = -0.9
	batch := make([]OmniChatMemoryEpisode, 0, 4)
	for i := 0; i < cap(batch); i++ {
		batch = append(batch, OmniChatMemoryEpisode{
			PersonaID:       fixture.personaID,
			OwnerUserID:     fixture.userID,
			ConversationID:  conversationID,
			Title:           fmt.Sprintf("The %dth thing he said", i),
			Summary:         "He meant every word of it.",
			Salience:        0.9,
			Distinctiveness: 0.8,
			// Two places, named in this order, are what a second extraction
			// mentioning them in the other order used to deadlock against.
			Entities: []OmniChatMemoryEntityRef{
				{CanonicalName: "Prague", Kind: OmniChatMemoryEntityPlace},
				{CanonicalName: "Berlin", Kind: OmniChatMemoryEntityPlace},
			},
			EmotionalValence: floatPtr(cruel),
		})
	}
	require.NoError(t, memories.RecordExtraction(ctx, conversationID, fixture.userID, 0, 9, batch))

	traits, err := traitRepo.Load(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)

	// Worked through by hand rather than recorded from a run. Mood takes half
	// of each valence and clamps: -0.45, -0.9, then the floor twice over.
	// Trust and warmth are past the threshold every time, so they take four
	// steps of -0.9 * 0.06 and -0.9 * 0.04.
	// The tolerance is the column's, not the arithmetic's: traits are stored
	// as float4 and come back a few parts in ten million off what Go computed.
	require.InDelta(t, -1, traits.Mood, 1e-6)
	require.InDelta(t, -0.216, traits.Trust, 1e-6)
	require.InDelta(t, -0.144, traits.Warmth, 1e-6)

	// And the same batch applied one episode at a time -- which is what the
	// extraction used to do, mid-transaction -- lands on exactly the same
	// numbers.
	for i := 0; i < len(batch); i++ {
		require.NoError(t, traitRepo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.otherID, cruel))
	}
	oneAtATime, err := traitRepo.Load(ctx, fixture.personaID, fixture.otherID)
	require.NoError(t, err)
	require.InDelta(t, oneAtATime.Mood, traits.Mood, 1e-6)
	require.InDelta(t, oneAtATime.Trust, traits.Trust, 1e-6)
	require.InDelta(t, oneAtATime.Warmth, traits.Warmth, 1e-6)
}

// A conversation needs both tiers and reads them together. The tiers still
// have to come back as themselves, and the scoping rule is unchanged: no other
// relationship may ride along in the same result.
func TestOmniChatCharacterTraitsLoadForConversationReadsBothTiers(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()

	fixture := seedMemoryFixture(t, pool, "traitpair")
	repo := NewOmniChatCharacterTraitRepository(pool)
	ctx := context.Background()

	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, OmniChatMemoryTierSelf, 0.9))
	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.userID, -0.9))
	require.NoError(t, repo.ApplyEpisodeValence(ctx, fixture.personaID, fixture.otherID, -0.9))

	self, relationship, err := repo.LoadForConversation(ctx, fixture.personaID, fixture.userID)
	require.NoError(t, err)

	require.Equal(t, OmniChatMemoryTierSelf, self.OwnerUserID)
	require.Greater(t, self.Trust, 0.0, "the self tier must not arrive as the relationship")
	require.Equal(t, fixture.userID, relationship.OwnerUserID)
	require.Less(t, relationship.Trust, 0.0)

	// The other user has a row, and a strongly negative one, but reading this
	// conversation cannot see it.
	theirs, err := repo.Load(ctx, fixture.personaID, fixture.otherID)
	require.NoError(t, err)
	require.Less(t, theirs.Trust, 0.0)
	require.NotEqual(t, fixture.otherID, relationship.OwnerUserID)

	// Both halves of a pair that has never been written are the neutral row
	// rather than an error, exactly as a single-tier read is.
	stranger := seedMemoryFixture(t, pool, "traitpairnew")
	self, relationship, err = repo.LoadForConversation(ctx, stranger.personaID, stranger.userID)
	require.NoError(t, err)
	require.Zero(t, self.Trust)
	require.Zero(t, relationship.Trust)
	require.Zero(t, self.Mood)
	require.Zero(t, relationship.Mood)
}
