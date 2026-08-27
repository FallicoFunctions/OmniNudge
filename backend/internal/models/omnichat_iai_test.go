package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/stretchr/testify/require"
)

// OmniChatIAILimitForTest is generous, because these tests are about the row
// rather than about the cap. The cap has its own test.
const OmniChatIAILimitForTest = 100

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
	}, OmniChatCharacterTraits{Warmth: 0.95, Trust: 0.85}, OmniChatIAILimitForTest)
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
	}, OmniChatCharacterTraits{Warmth: 0.95, Trust: 0.85}, OmniChatIAILimitForTest)
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
	}, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
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

	first, err := repo.CreateIAI(ctx, creatorID, persona, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
	require.NoError(t, err)
	second, err := repo.CreateIAI(ctx, creatorID, persona, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
	require.NoError(t, err, "the same name twice is not a collision")

	require.NotEqual(t, first.Slug, second.Slug)
	require.Contains(t, first.Slug, "sam")
	require.Contains(t, second.Slug, "sam")
}

func TestWhatSheLooksLikeIsKeptForWhoeverEventuallyDrawsHer(t *testing.T) {
	// Nothing renders her yet. It is stored because creation is the only moment
	// somebody is thinking about it, and asking again later is worse.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_looks")

	created, err := repo.CreateIAI(ctx, creatorID, IAIPersona{
		SlugBase: "hers", Name: "Hers",
		Appearance: []byte(`{"style":"anime","hair":"curly"}`),
	}, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
	require.NoError(t, err)
	require.JSONEq(t, `{"style":"anime","hair":"curly"}`, string(created.IAIAppearance))

	var stored []byte
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT iai_appearance FROM bot_personas WHERE id = $1`, created.ID).Scan(&stored))
	require.JSONEq(t, `{"style":"anime","hair":"curly"}`, string(stored))

	// And it comes back out of the API as an object rather than base64. A plain
	// []byte marshals to base64 in Go, so the field was returning a blob no
	// client could read.
	encoded, err := json.Marshal(created)
	require.NoError(t, err)
	require.Contains(t, string(encoded), `"iai_appearance":{`)
	require.Contains(t, string(encoded), `"style":"anime"`)
}

func TestACharacterNobodyDescribedStoresNothingRatherThanBlank(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_nolooks")

	created, err := repo.CreateIAI(ctx, creatorID,
		IAIPersona{SlugBase: "hers", Name: "Hers"}, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
	require.NoError(t, err)

	var stored []byte
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT iai_appearance FROM bot_personas WHERE id = $1`, created.ID).Scan(&stored))
	require.Nil(t, stored, "never asked is not the same as asked and declined")
}

func roleplayFixture(slug string) *BotPersona {
	return &BotPersona{
		Slug: slug, Name: "A Part", Category: PersonaCategoryOriginal,
		Visibility: "private", SourceFormat: "native",
		AlternateGreetings: []string{}, Tags: []string{}, GalleryURLs: []string{},
		ExtensionsJSON: json.RawMessage(`{}`),
	}
}

func TestOneIndependentCharacterAtATime(t *testing.T) {
	// §34: deleting her is how another is made. The count and the insert are
	// one decision, so two requests arriving together cannot both read "none
	// yet" and both create.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_onlyone")

	_, err := repo.CreateIAI(ctx, creatorID,
		IAIPersona{SlugBase: "sam", Name: "Sam"}, OmniChatCharacterTraits{}, 1)
	require.NoError(t, err)

	_, err = repo.CreateIAI(ctx, creatorID,
		IAIPersona{SlugBase: "alex", Name: "Alex"}, OmniChatCharacterTraits{}, 1)
	require.ErrorIs(t, err, ErrIAILimitReached)

	// Somebody else is unaffected: the limit is per account.
	otherID := iaiCreator(t, pool, "iai_owner_other")
	_, err = repo.CreateIAI(ctx, otherID,
		IAIPersona{SlugBase: "sam", Name: "Sam"}, OmniChatCharacterTraits{}, 1)
	require.NoError(t, err)
}

func TestTwoRequestsAtOnceStillMakeOneCharacter(t *testing.T) {
	// The whole reason the count sits inside the transaction behind an advisory
	// lock. Sequentially the limit obviously holds; the case it exists for is
	// eight requests reading "none yet" at the same instant.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	creatorID := iaiCreator(t, pool, "iai_owner_race")

	const attempts = 8
	start := make(chan struct{})
	results := make(chan error, attempts)
	var ready sync.WaitGroup
	ready.Add(attempts)

	for index := range attempts {
		go func(index int) {
			ready.Done()
			<-start
			_, err := repo.CreateIAI(ctx, creatorID, IAIPersona{
				SlugBase: fmt.Sprintf("racer%d", index), Name: "Sam",
			}, OmniChatCharacterTraits{}, 1)
			results <- err
		}(index)
	}
	ready.Wait()
	close(start)

	created, refused := 0, 0
	for range attempts {
		switch err := <-results; {
		case err == nil:
			created++
		case errors.Is(err, ErrIAILimitReached):
			refused++
		default:
			require.NoError(t, err)
		}
	}

	require.Equal(t, 1, created, "exactly one of eight simultaneous creations may win")
	require.Equal(t, attempts-1, refused)

	var stored int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM bot_personas WHERE owner_user_id = $1`, creatorID).Scan(&stored))
	require.Equal(t, 1, stored, "and the database agrees")
}

func TestRoleplayCharactersAreCountedSeparatelyFromHer(t *testing.T) {
	// Two limits for two kinds. A shelf full of roleplay characters must not
	// stop somebody making the one IAI they are entitled to, and vice versa.
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	ownerID := iaiCreator(t, pool, "iai_owner_mixed")

	_, err := repo.CreateIAI(ctx, ownerID,
		IAIPersona{SlugBase: "sam", Name: "Sam"}, OmniChatCharacterTraits{}, 1)
	require.NoError(t, err)

	// The IAI does not consume a roleplay slot.
	_, err = repo.CreateOwned(ctx, ownerID, roleplayFixture("rp-1"), 1)
	require.NoError(t, err)

	// And the roleplay character does not free her slot.
	_, err = repo.CreateIAI(ctx, ownerID,
		IAIPersona{SlugBase: "alex", Name: "Alex"}, OmniChatCharacterTraits{}, 1)
	require.ErrorIs(t, err, ErrIAILimitReached)
}

func TestARoleplayShelfStopsAtThePlansLimit(t *testing.T) {
	pool, cleanup := setupMemoryTestDB(t)
	defer cleanup()
	ctx := context.Background()
	repo := NewBotPersonaRepository(pool)
	ownerID := iaiCreator(t, pool, "iai_owner_shelf")

	_, err := repo.CreateOwned(ctx, ownerID, roleplayFixture("rp-a"), 2)
	require.NoError(t, err)
	_, err = repo.CreateOwned(ctx, ownerID, roleplayFixture("rp-b"), 2)
	require.NoError(t, err)

	_, err = repo.CreateOwned(ctx, ownerID, roleplayFixture("rp-c"), 2)
	require.ErrorIs(t, err, ErrRoleplayLimitReached)

	// The refused one left nothing behind.
	var owned int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM bot_personas WHERE owner_user_id = $1`, ownerID).Scan(&owned))
	require.Equal(t, 2, owned, "two roleplay characters, and the refused third was not written")
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
	}, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
	require.Error(t, err, "an out-of-range baseline is caught here, not three layers down in a constraint")

	_, err = repo.CreateIAI(ctx, 0, IAIPersona{Name: "Hers"}, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
	require.Error(t, err, "an IAI without a creator has nobody to feel anything about")

	_, err = repo.CreateIAI(ctx, creatorID, IAIPersona{Name: "Hers"}, OmniChatCharacterTraits{}, OmniChatIAILimitForTest)
	require.Error(t, err, "and she needs an identity")
}
