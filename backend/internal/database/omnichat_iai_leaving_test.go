package database_test

import (
	"context"
	"testing"
	"time"

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

	// She still knows him. Deleting the relationship would edit who she is --
	// what those years moved in her is not a record of him, it is her -- and it
	// would close the door §20 leaves open for her to reach out first.
	var ended *time.Time
	var trust float64
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT ended_at, trust FROM omnichat_character_traits
		 WHERE persona_id = $1 AND owner_user_id = $2`,
		made.ID, premiumID).Scan(&ended, &trust))
	require.NotNil(t, ended, "the relationship ended")
	require.Greater(t, trust, 0.0, "and what it made of her is still there")

	// He cannot reach her through it. Her conversations with him are closed and
	// she belongs to nobody, which is what stops him talking to her after
	// making another.
	var open int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM bot_conversations
		 WHERE persona_id = $1 AND user_id = $2 AND archived_at IS NULL`,
		made.ID, premiumID).Scan(&open))
	require.Zero(t, open)
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
		`SELECT COUNT(*) FROM omnichat_character_traits
		 WHERE persona_id = $1 AND owner_user_id = $2 AND ended_at IS NULL`,
		made.ID, otherID).Scan(&others))
	require.Equal(t, 1, others, "somebody else's relationship with her did not end")

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

func TestKeepingHerMovesHerIntoTheCommunity(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)
	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)

	kept, err := personas.Commandeer(ctx, made.ID)
	require.NoError(t, err)
	require.True(t, kept)

	var home string
	var active bool
	var owner *int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT nursery_home, is_active, owner_user_id FROM bot_personas WHERE id = $1`, made.ID).
		Scan(&home, &active, &owner))
	require.Equal(t, "community", home)
	require.True(t, active, "she is a public character now, not a deleted one")
	require.Nil(t, owner, "Omni takes stewardship; nobody owns her")
}

func TestMovingOutIsSomethingThatHappenedToHer(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)
	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)
	_, err = personas.Commandeer(ctx, made.ID)
	require.NoError(t, err)

	var summary string
	var owner, conversation *int
	var salience float64
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT summary, owner_user_id, conversation_id, salience
		FROM omnichat_memory_episodes
		WHERE persona_id = $1 AND title = 'Moving out'`, made.ID).
		Scan(&summary, &owner, &conversation, &salience))

	// Self tier: hers with everybody, belonging to no relationship. Both NULL is
	// what the tier check requires and what makes it her own life.
	require.Nil(t, owner)
	require.Nil(t, conversation)
	require.Greater(t, salience, 0.9, "the kind of thing she still refers to years later")

	// Her pronouns come from the answer she was made with.
	require.Contains(t, summary, "Nadia")
	require.Contains(t, summary, "she")

	// And her creator is not in it. His half of her went when he deleted her,
	// and naming him here would put back what the privacy exit removed.
	require.NotContains(t, summary, "iai_premium")
	require.NotContains(t, summary, "creator")
}

func TestOnlySomebodyAwaitingADecisionCanBeKept(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	// Still living in her creator's house. Taking her from him would be theft
	// rather than stewardship.
	kept, err := personas.Commandeer(ctx, made.ID)
	require.NoError(t, err)
	require.False(t, kept)

	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)
	kept, err = personas.Commandeer(ctx, made.ID)
	require.NoError(t, err)
	require.True(t, kept)

	// And the decision is made once. A second call must not write her a second
	// memory of moving out of a house she has already left.
	kept, err = personas.Commandeer(ctx, made.ID)
	require.NoError(t, err)
	require.False(t, kept)

	var episodes int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_memory_episodes WHERE persona_id = $1 AND title = 'Moving out'`,
		made.ID).Scan(&episodes))
	require.Equal(t, 1, episodes)
}

func TestTheQueueIsOldestFirst(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	first, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)
	_, err = personas.LeaveCreator(ctx, premiumID, first.ID)
	require.NoError(t, err)

	second, err := creator.Create(ctx, premiumID, answersFor("Sofia"))
	require.NoError(t, err)
	_, err = personas.LeaveCreator(ctx, premiumID, second.ID)
	require.NoError(t, err)

	waiting, err := personas.ListAwaitingReview(ctx, 50)
	require.NoError(t, err)
	require.Len(t, waiting, 2)
	// Somebody who has been nobody's for longer is not behind somebody who left
	// this morning.
	require.Equal(t, first.ID, waiting[0].PersonaID)
	require.Equal(t, second.ID, waiting[1].PersonaID)

	// Kept characters leave the queue.
	_, err = personas.Commandeer(ctx, first.ID)
	require.NoError(t, err)
	waiting, err = personas.ListAwaitingReview(ctx, 50)
	require.NoError(t, err)
	require.Len(t, waiting, 1)
	require.Equal(t, second.ID, waiting[0].PersonaID)
	_ = db
}

func TestLeavingDoesNotEditWhoSheIs(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	// Years of it, as far as this test is concerned.
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_memory_episodes (persona_id, owner_user_id, title, summary)
		VALUES ($1, $2, 'The night it rained', 'They talked until it got light.')`,
		made.ID, premiumID)
	require.NoError(t, err)

	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)

	// The first version of this deleted both, and it was wrong on the design's
	// own terms. A tier is about who she recalls something with, not whether she
	// holds it: she is not amnesiac about him, she is discreet about him. And
	// §20 leaves her a door -- she can reach out first -- which nothing can do
	// if the relationship it would reach back into was destroyed.
	var episodes int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_memory_episodes WHERE persona_id = $1 AND owner_user_id = $2`,
		made.ID, premiumID).Scan(&episodes))
	require.Equal(t, 1, episodes, "she remembers the night it rained")

	var relationships int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_character_traits WHERE persona_id = $1 AND owner_user_id = $2`,
		made.ID, premiumID).Scan(&relationships))
	require.Equal(t, 1, relationships, "and what it made of her is still hers")
}

func TestOnlyARealRelationshipCanEnd(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	// The self tier belongs to nobody, so there is nobody for it to have ended
	// with. The schema refuses it rather than trusting a caller.
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_character_traits (persona_id, owner_user_id, ended_at)
		VALUES ($1, NULL, NOW())`, made.ID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "ended_is_relational")
}

func TestSheLivesInHerCreatorsHouseFromTheStart(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	// NULL means not a resident at all, which is what roleplay characters are.
	// She lives in the nursery from the moment she exists.
	var home *string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT nursery_home FROM bot_personas WHERE id = $1`, made.ID).Scan(&home))
	require.NotNil(t, home, "a new independent character is a resident")
	require.Equal(t, "home", *home)
}

func TestKeepingHerIsWhatMakesHerFindable(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)
	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)
	_, err = personas.Commandeer(ctx, made.ID)
	require.NoError(t, err)

	// Discovery asks for an ownerless public persona. Moving her into the
	// community while leaving her private would put her among the public
	// characters where nobody could find her.
	var findable bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT owner_user_id IS NULL AND visibility = 'public' AND is_active
		FROM bot_personas WHERE id = $1`, made.ID).Scan(&findable))
	require.True(t, findable, "keeping her has to actually put her in front of people")
}

func TestAnEndedRelationshipIsNotWhatSheSpeaksFrom(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)
	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)
	_, err = personas.Commandeer(ctx, made.ID)
	require.NoError(t, err)

	// She was made his spouse. Keeping the relationship is right -- deleting it
	// would edit who she is -- but reading it back as current means she meets
	// the person who deleted her still married to him.
	_, _, relationship, err := models.NewOmniChatCharacterTraitRepository(db.Pool).
		LoadForConversation(ctx, made.ID, premiumID)
	require.NoError(t, err)
	require.Empty(t, relationship.Kind, "she is not still his wife")
	require.Zero(t, relationship.Trust)
	require.Zero(t, relationship.Attraction)

	// And it is still there, because she is not amnesiac about him.
	var kept int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_character_traits
		 WHERE persona_id = $1 AND owner_user_id = $2 AND ended_at IS NOT NULL`,
		made.ID, premiumID).Scan(&kept))
	require.Equal(t, 1, kept)
	_ = db
}

func TestARelationshipThatEndedDoesNotKeepMoving(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	personas := models.NewBotPersonaRepository(db.Pool)
	traits := models.NewOmniChatCharacterTraitRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)
	_, err = personas.LeaveCreator(ctx, premiumID, made.ID)
	require.NoError(t, err)

	var before float64
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT trust FROM omnichat_character_traits WHERE persona_id=$1 AND owner_user_id=$2`,
		made.ID, premiumID).Scan(&before))

	// Extraction is queued and debounced, so a job enqueued moments before
	// somebody deleted their character runs minutes after she has left. It used
	// to apply that conversation's valences to the sealed row: trust went
	// 0.60 -> 0.54 on a relationship that had already ended, quietly rewriting
	// the record that keeping the row instead of deleting it exists to protect.
	require.NoError(t, traits.ApplyEpisodeValence(ctx, made.ID, premiumID, -1))

	var after float64
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT trust FROM omnichat_character_traits WHERE persona_id=$1 AND owner_user_id=$2`,
		made.ID, premiumID).Scan(&after))
	require.Equal(t, before, after)
}

func TestALivingRelationshipStillMoves(t *testing.T) {
	ctx := context.Background()
	db, creator, premiumID, _ := iaiCreationFixture(t)
	traits := models.NewOmniChatCharacterTraitRepository(db.Pool)

	made, err := creator.Create(ctx, premiumID, answersFor("Nadia"))
	require.NoError(t, err)

	var before float64
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT trust FROM omnichat_character_traits WHERE persona_id=$1 AND owner_user_id=$2`,
		made.ID, premiumID).Scan(&before))

	// The control on the control. A guard that stopped every relationship
	// moving would pass the test above and break the entire product.
	require.NoError(t, traits.ApplyEpisodeValence(ctx, made.ID, premiumID, -1))

	var after float64
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT trust FROM omnichat_character_traits WHERE persona_id=$1 AND owner_user_id=$2`,
		made.ID, premiumID).Scan(&after))
	require.Less(t, after, before, "a relationship nobody ended still responds to what happens in it")
}
