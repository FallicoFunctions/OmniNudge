package models

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stretchr/testify/require"
)

func iaiCreator(t *testing.T, pool *pgxpool.Pool, username string) int {
	t.Helper()
	user := &User{Username: username, PasswordHash: "hash", Role: "user"}
	require.NoError(t, NewUserRepository(pool).Create(context.Background(), user))
	return user.ID
}

func TestAnIAIArrivesWithNowhereToPutAnInstruction(t *testing.T) {
	// §13's claim, checked against the row rather than trusted. The hardcode
	// channels are what make behaviour binding, and this writer does not name
	// them, so "she will never leave him" has nowhere to land.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_channels")

	created, err := repo.CreateIAI(ctx, creatorID, IAIPersona{
		SlugBase: "hers", Name: "Hers", Personality: "Drawn to games and music.",
		Baseline: OmniChatDispositionBaseline{Mood: 0.2, Trust: 0.1, Warmth: 0.4, Firmness: -0.1},
	}, OmniChatCharacterTraits{Warmth: 0.95, Trust: 0.85})
	require.NoError(t, err)

	var systemPrompt, scenario, postHistory, exampleDialogue string
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT system_prompt, scenario, post_history_instructions, example_dialogue
		FROM bot_personas WHERE id = $1
	`, created.ID).Scan(&systemPrompt, &scenario, &postHistory, &exampleDialogue))

	require.Empty(t, systemPrompt)
	require.Empty(t, scenario)
	require.Empty(t, postHistory)
	require.Empty(t, exampleDialogue)
	require.Equal(t, ResponseStyleProfileDirectMessage, created.ResponseStyleProfile)
	require.NotNil(t, created.OwnerUserID)
	require.Equal(t, creatorID, *created.OwnerUserID)
}

func TestSheStartsOutFeelingThatWayAboutHerCreatorAndNobodyElse(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	traits := NewOmniChatCharacterTraitRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_feeling")
	strangerID := iaiCreator(t, pool, "iai_stranger")

	created, err := repo.CreateIAI(ctx, creatorID, IAIPersona{
		SlugBase: "hers", Name: "Hers",
		Baseline: OmniChatDispositionBaseline{Mood: 0.1, Trust: 0.1, Warmth: 0.1, Firmness: 0.1},
	}, OmniChatCharacterTraits{Warmth: 0.95, Trust: 0.85})
	require.NoError(t, err)

	_, _, hers, err := traits.LoadForConversation(ctx, created.ID, creatorID)
	require.NoError(t, err)
	require.InDelta(t, 0.95, hers.Warmth, 0.01)
	require.InDelta(t, 0.85, hers.Trust, 0.01)

	// §34's promise, which is the whole reason this lives on the relationship
	// rather than the baseline.
	_, _, theirs, err := traits.LoadForConversation(ctx, created.ID, strangerID)
	require.NoError(t, err)
	require.Zero(t, theirs.Warmth, "anyone else who meets her starts from nothing")
	require.Zero(t, theirs.Trust)
}

func TestHerBaselineIsWrittenWhenSheIsMade(t *testing.T) {
	// It cannot be set afterwards: SetOmniChatDispositionBaseline refuses a
	// persona with an owner, having been built for the derivation command that
	// walks platform characters.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_baseline")

	baseline := OmniChatDispositionBaseline{Mood: 0.26, Trust: 0.25, Warmth: 0.38, Firmness: -0.18}
	created, err := repo.CreateIAI(ctx, creatorID, IAIPersona{
		SlugBase: "hers", Name: "Hers", Baseline: baseline,
	}, OmniChatCharacterTraits{})
	require.NoError(t, err)

	stored, err := repo.LoadOmniChatDispositionBaseline(ctx, created.ID)
	require.NoError(t, err)
	require.True(t, stored.Derived, "a character made from answers has been read")
	require.InDelta(t, baseline.Warmth, stored.Warmth, 0.01)
	require.InDelta(t, baseline.Firmness, stored.Firmness, 0.01)

	updated, err := repo.SetOmniChatDispositionBaseline(ctx, created.ID, OmniChatDispositionBaseline{}, true)
	require.NoError(t, err)
	require.False(t, updated, "the derivation writer still refuses somebody's own character")
}

func TestOnePersonMayMakeTwoCharactersWithTheSameName(t *testing.T) {
	// Somebody will do this inside a minute, and the first version failed on
	// bot_personas_slug_key when they did. Her id is what makes the slug
	// unique, so the readable half never has to be.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_twins")

	persona := IAIPersona{SlugBase: "sam", Name: "Sam"}

	first, err := repo.CreateIAI(ctx, creatorID, persona, OmniChatCharacterTraits{})
	require.NoError(t, err)
	second, err := repo.CreateIAI(ctx, creatorID, persona, OmniChatCharacterTraits{})
	require.NoError(t, err, "the same name twice is not a collision")

	require.NotEqual(t, first.Slug, second.Slug)
	require.Contains(t, first.Slug, "sam")
	require.Contains(t, second.Slug, "sam")
}

func TestCreationRefusesRatherThanWritingHalfACharacter(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_refuse")

	_, err := repo.CreateIAI(ctx, creatorID, IAIPersona{
		SlugBase: "hers", Name: "Hers",
		Baseline: OmniChatDispositionBaseline{Warmth: 5},
	}, OmniChatCharacterTraits{})
	require.Error(t, err, "an out-of-range baseline is caught here, not three layers down in a constraint")

	_, err = repo.CreateIAI(ctx, 0, IAIPersona{Name: "Hers"}, OmniChatCharacterTraits{})
	require.Error(t, err, "an IAI without a creator has nobody to feel anything about")

	_, err = repo.CreateIAI(ctx, creatorID, IAIPersona{Name: "Hers"}, OmniChatCharacterTraits{})
	require.Error(t, err, "and she needs an identity")
}
