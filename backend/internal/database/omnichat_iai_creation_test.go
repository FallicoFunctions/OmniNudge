package database_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
)

// The whole creation path against a real database: entitlement, the answers
// becoming a disposition, appearance surviving encoding, and the row.
//
// The pieces are tested apart, and apart they agreed with each other while the
// composition refused everybody -- the service tests stub the user reader, so
// nothing had ever asked whether a real premium row passes.

func iaiCreationFixture(t *testing.T) (*database.Database, *services.OmniChatIAICreator, int, int) {
	t.Helper()
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	premium := &models.User{Username: "iai_premium", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, premium))
	plus := &models.User{Username: "iai_plus", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, plus))

	// Create does not write the plan column, so set it the way a subscription
	// would. Doing this by hand is the only reason the entitlement is exercised
	// against a real row at all.
	for id, plan := range map[int]string{premium.ID: models.PlanPremium, plus.ID: models.PlanPlus} {
		_, err = db.Pool.Exec(ctx, `UPDATE users SET plan=$2 WHERE id=$1`, id, plan)
		require.NoError(t, err)
	}

	creator := services.NewOmniChatIAICreator(
		models.NewBotPersonaRepository(db.Pool), repository.NewPostgresUserRepository(db.Pool))
	return db, creator, premium.ID, plus.ID
}

func TestTheWholeCreationPathMakesSomebody(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)

	made, err := creator.Create(ctx, premiumID, services.IAIAnswers{
		Name:         "Sam",
		Temperaments: []string{"warm", "playful", "sharp"},
		Interests:    []string{"games", "music"},
		// Guarded toward the person she is married to: a marriage in a bad month,
		// and the combination that could not be said while one ladder ran from
		// indifferent to besotted. The feeling still owns how she feels; the
		// relationship says what they are.
		Feeling:      "guarded",
		Relationship: "spouse",
		Appearance: services.IAIAppearance{
			Style: "anime", Gender: "woman", Age: 27, HeightInches: 65,
			HairLength: "long", HairTexture: "curly", HairStyle: "high_ponytail",
			Ethnicity: "not-a-real-option",
		},
	})
	require.NoError(t, err)

	require.Contains(t, made.Slug, "sam")
	require.Equal(t, "Drawn to games and music.", made.Personality)
	require.Equal(t, models.ResponseStyleProfileDirectMessage, made.ResponseStyleProfile)

	// Appearance survives as JSON, and the answer nobody recognises is gone
	// rather than stored for a generator to choke on later.
	require.JSONEq(t,
		`{"style":"anime","gender":"woman","age":27,"height_inches":65,`+
			`"hair_length":"long","hair_texture":"curly","hair_style":"high_ponytail"}`,
		string(made.IAIAppearance))

	// She feels that way about her creator, and her baseline is her own.
	baseline, _, relationship, err := models.NewOmniChatCharacterTraitRepository(db.Pool).
		LoadForConversation(ctx, made.ID, premiumID)
	require.NoError(t, err)
	require.True(t, baseline.Derived)

	// Both halves of the answer reach the row, separately. This is the whole
	// path -- form to seed to insert to read -- and each of those was a place
	// the second half could have been dropped without anything noticing.
	require.Less(t, relationship.Trust, 0.0, "guarded: she does not trust him yet")
	require.Greater(t, relationship.Attraction, 0.6, "and is married to him anyway")
	require.Equal(t, "spouse", relationship.Kind, "the word survives the whole path")
	require.InDelta(t, 0.50, relationship.Attachment, 0.01,
		"a spouse starts past the part where you become attached")

	// And her speech came from the traits she was made with rather than from a
	// zero nobody chose.
	require.Greater(t, baseline.Talkativeness, 0.1,
		"warm and playful are talkative traits, and sharp does not cancel them")
}

func TestOnlyAnEntitledAccountGetsOne(t *testing.T) {
	ctx := context.Background()
	_, creator, premiumID, plusID := iaiCreationFixture(t)
	answers := services.IAIAnswers{Name: "Sam", Feeling: "fond"}

	_, err := creator.Create(ctx, plusID, answers)
	require.ErrorIs(t, err, services.ErrIAICreationNotEntitled,
		"§19: free and the lowest paid tier do not get IAI at all")

	_, err = creator.Create(ctx, premiumID, answers)
	require.NoError(t, err)
}

func TestNobodyMakesACharacterUnderEighteen(t *testing.T) {
	ctx := context.Background()
	_, creator, premiumID, _ := iaiCreationFixture(t)

	_, err := creator.Create(ctx, premiumID, services.IAIAnswers{
		Name: "Sam", Appearance: services.IAIAppearance{Age: 15},
	})
	require.ErrorIs(t, err, services.ErrIAIUnderage)
}

func TestAnAdminCanMakeMoreThanOne(t *testing.T) {
	// The unit test checks the number the allowance returns. This checks that
	// the database agrees: the cap is enforced inside the transaction, behind an
	// advisory lock, and a limit that only existed in Go would be refused there.
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)

	_, err := db.Pool.Exec(ctx, `UPDATE users SET role = 'admin' WHERE id = $1`, premiumID)
	require.NoError(t, err)

	first, err := creator.Create(ctx, premiumID, services.IAIAnswers{
		Name: "First", Temperaments: []string{"warm"}, Feeling: "fond",
	})
	require.NoError(t, err)

	second, err := creator.Create(ctx, premiumID, services.IAIAnswers{
		Name: "Second", Temperaments: []string{"guarded"}, Feeling: "neutral",
	})
	require.NoError(t, err, "an admin is the one account that has to be able to make a second")
	require.NotEqual(t, first.ID, second.ID)
}

func TestEverybodyElseStillGetsOne(t *testing.T) {
	// The limit is the rule rather than a shortage. Keeping one alive is what
	// makes her memory and her drift mean anything.
	ctx := context.Background()
	_, creator, premiumID, _ := iaiCreationFixture(t)

	_, err := creator.Create(ctx, premiumID, services.IAIAnswers{
		Name: "Only", Temperaments: []string{"warm"}, Feeling: "fond",
	})
	require.NoError(t, err)

	_, err = creator.Create(ctx, premiumID, services.IAIAnswers{
		Name: "Another", Temperaments: []string{"warm"}, Feeling: "fond",
	})
	require.ErrorIs(t, err, models.ErrIAILimitReached)
}
