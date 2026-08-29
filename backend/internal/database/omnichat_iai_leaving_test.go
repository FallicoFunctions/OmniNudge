package database_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// answersFor is one complete set, so each test here differs only in what it
// does after she exists.
func answersFor(name string) services.IAIAnswers {
	return services.IAIAnswers{
		Name:         name,
		Temperaments: []string{"warm"},
		Interests:    []string{"music"},
		Feeling:      "close",
		Relationship: "spouse",
		Appearance: services.IAIAppearance{
			Style: "realistic", Gender: "woman", Age: 30, HeightInches: 65,
		},
	}
}

func TestDeletingHerIsHerLeaving(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	left, err := personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)
	require.True(t, left)

	// She still exists. Deleting an independent character does not end her --
	// it ends his half of her.
	var home *string
	var owner *int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT nursery_home, owner_user_id FROM bot_personas WHERE id = $1`, made.ID).
		Scan(&home, &owner))
	require.NotNil(t, home)
	require.Equal(t, "review", *home, "she left his house and awaits a decision")
	require.Nil(t, owner, "and belongs to nobody in the meantime")

	// His half is gone, which is the privacy exit and the reason he cannot go
	// on talking to her after making another.
	var traits int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_character_traits WHERE persona_id = $1 AND owner_user_id = $2`,
		made.ID, premiumID).Scan(&traits))
	require.Zero(t, traits, "she does not know him any more")
}

func TestTheSlotIsFreeTheMomentSheLeaves(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	first, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	// One at a time, while she is still his.
	_, err = creator.Create(ctx, premiumID, answersFor("Sofia"))
	require.ErrorIs(t, err, models.ErrIAILimitReached)

	left, err := personas.LeaveCreator(ctx, premiumID, first.ID)
	require.NoError(t, err)
	require.True(t, left)

	// Immediately, without waiting on anybody's review. Somebody who cannot see
	// the progress of a decision should not be blocked behind it.
	second, err := creator.Create(ctx, premiumID, answersFor("Sofia"))
	require.NoError(t, err)
	require.NotEqual(t, first.ID, second.ID)
	_ = db
}

func TestSheKeepsWhatIsNotHis(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, otherID := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	// Somebody else's relationship with her, and a self-tier memory that
	// belongs to nobody -- her own life.
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_character_traits (persona_id, owner_user_id, trust, warmth)
		VALUES ($1, $2, 0.4, 0.4)`, made.ID, otherID)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, title, summary)
		VALUES ($1, NULL, 'A day of her own', 'Nothing to do with him.')`, made.ID)
	require.NoError(t, err)

	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)

	var others, self int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_character_traits WHERE persona_id = $1 AND owner_user_id = $2`,
		made.ID, otherID).Scan(&others))
	require.Equal(t, 1, others, "what she is to other people is not his to delete")

	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_memory_episodes WHERE persona_id = $1 AND owner_user_id IS NULL`,
		made.ID).Scan(&self))
	require.Equal(t, 1, self, "and neither is her own life")
}

func TestARoleplayCharacterHasNoHouseToLeave(t *testing.T) {
	ctx := context.Background()
	db, _, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	var roleplayID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (name, slug, description, personality, system_prompt,
			owner_user_id, response_style_profile)
		VALUES ('Card', 'card', 'd', 'p', 'sp', $1, 'natural_dialogue')
		RETURNING id`, premiumID).Scan(&roleplayID))

	_, err := personas.LeaveCreator(ctx, premiumID, roleplayID)
	require.ErrorIs(t, err, models.ErrNotAnIAI,
		"they are not nursery residents, so the ordinary delete is the right path")
}
