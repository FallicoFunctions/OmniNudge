package services

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"

	"github.com/stretchr/testify/require"
)

func TestTheInterestsOnTheFormAreTheOnesTheSpecOffers(t *testing.T) {
	// Same guard the temperaments have. §34 lists these by name and the
	// interface renders whatever this returns; if the two drift, somebody picks
	// something that converts to nothing and gets a blanker character than they
	// chose, with no error anywhere.
	keys := IAIInterestKeys()
	require.Len(t, keys, 40, "nine was too few to describe anybody")

	// Order is the form's, so the grid does not reshuffle itself between loads.
	require.Equal(t, []string{
		"games", "anime", "comics", "film", "music", "reading",
		"horror", "true_crime", "mysteries", "comedy", "theatre",
		"writing", "poetry", "art", "photography", "crafts", "fashion",
		"architecture", "cooking", "baking", "coffee",
		"sports", "fitness", "martial_arts", "dance", "hiking",
		"nature", "animals", "gardening", "travel", "languages",
		"history", "mythology", "philosophy", "psychology", "science",
		"space", "technology", "cars", "current_events",
	}, keys)
}

func TestTheThreeThatWereRemovedStayRemoved(t *testing.T) {
	// "Going out" and "staying in" describe how somebody spends an evening
	// rather than what they are interested in, and each cost one slot out of
	// only three to say something a character shows anyway.
	//
	// "Being physical" meant exercise, or affection, or sex, or fighting, or
	// working with your hands, depending on who read it -- and for somebody
	// with no body at all it meant less than that. Sport and training are two
	// of those things said plainly.
	keys := IAIInterestKeys()
	for _, gone := range []string{"going_out", "staying_in", "making_things"} {
		require.NotContains(t, keys, gone)
	}
	require.Contains(t, keys, "sports")
	require.Contains(t, keys, "fitness")
	require.Contains(t, keys, "crafts", "which is what making things actually meant")

	// A key that no longer exists converts to nothing rather than to an error,
	// so a form left behind by a deploy costs a detail and not the character.
	require.Empty(t, renderIAIInterests([]string{"going_out"}))
	require.Equal(t, "Drawn to games.", renderIAIInterests([]string{"going_out", "games"}))
}

func TestNoTwoInterestsSayTheSameThing(t *testing.T) {
	// Forty rows written by hand. Two keys sharing a reading would be two
	// choices producing one character, and the person who picked both would
	// have spent two of three slots on one idea.
	seenKey := map[string]bool{}
	seenReads := map[string]string{}
	for _, interest := range iaiInterests {
		require.False(t, seenKey[interest.Key], "%s appears twice", interest.Key)
		seenKey[interest.Key] = true

		require.NotEmpty(t, interest.Reads, "%s has nothing to say", interest.Key)
		require.Equal(t, strings.ToLower(interest.Reads), interest.Reads,
			"%s reads mid-sentence, so it starts lower case", interest.Key)

		// Three picks are joined into one sentence, so a reading carrying its
		// own conjunction makes the join ambiguous: "games, films and shows and
		// puzzles and mysteries" has no readable boundary between the items.
		require.NotContains(t, interest.Reads, " and ",
			"%s reads as two things; the sentence already supplies the and", interest.Key)
		require.NotContains(t, interest.Reads, ",",
			"%s carries its own comma, which is what the join uses", interest.Key)
		if first, clash := seenReads[interest.Reads]; clash {
			require.Fail(t, "two interests read the same",
				"%s and %s both read %q", first, interest.Key, interest.Reads)
		}
		seenReads[interest.Reads] = interest.Key
	}
}

func TestSheIsDrawnToThingsRatherThanHavingDoneThem(t *testing.T) {
	// §35. She was made recently, so "has played since she was small" is a past
	// she did not have. Every line here is present tense.
	rendered := renderIAIInterests([]string{"games", "music"})

	require.Equal(t, "Drawn to games and music.", rendered)
	for _, past := range []string{"years", "since", "always", "grew up", "used to"} {
		require.NotContains(t, strings.ToLower(rendered), past)
	}
}

func TestSheIsDrawnToAtMostThree(t *testing.T) {
	// Counting punctuation would be measuring the sentence rather than the
	// picks -- an entry containing its own comma broke exactly that.
	all := renderIAIInterests(IAIInterestKeys())

	matched := 0
	for _, interest := range iaiInterests {
		if strings.Contains(all, interest.Reads) {
			matched++
		}
	}
	require.Equal(t, omniChatIAIInterestPicks, matched,
		"nine answers offered, three of them kept")
}

func TestTheSameInterestTwiceIsOneInterest(t *testing.T) {
	require.Equal(t,
		renderIAIInterests([]string{"music"}),
		renderIAIInterests([]string{"music", "music", "music"}))
}

func TestAnInterestNobodyRecognisesIsSkipped(t *testing.T) {
	require.Equal(t,
		renderIAIInterests([]string{"music"}),
		renderIAIInterests([]string{"music", "spelunking"}))
	require.Empty(t, renderIAIInterests(nil))
	require.Empty(t, renderIAIInterests([]string{"spelunking"}))
}

func TestASlugSurvivesANameItCannotSpell(t *testing.T) {
	// A name in a script with no ASCII still needs a usable identity rather
	// than an empty one. Uniqueness is the repository's job, so this only has
	// to be readable and safe.
	require.Equal(t, "sam", iaiSlugBase("Sam"))
	require.Equal(t, "iai", iaiSlugBase("さくら"))
	require.Equal(t, "anne-marie", iaiSlugBase("  Anne-Marie!!  "))
	require.NotContains(t, iaiSlugBase("A Very Long Name That Somebody Typed Out In Full"), " ")
	require.LessOrEqual(t, len(iaiSlugBase(strings.Repeat("long ", 40))), 48)
}

type stubUserReader struct {
	user *models.User
	err  error
}

func (r stubUserReader) GetByID(context.Context, int) (*models.User, error) {
	return r.user, r.err
}

func TestOnlyTheTopTierMakesIndependentCharacters(t *testing.T) {
	// §19. Free and the lowest paid tier do not get IAI at all, which is what
	// gives the creator payout pool a clean source.
	for _, testCase := range []struct {
		plan    string
		role    string
		allowed bool
	}{
		{plan: models.PlanPremium, allowed: true},
		{plan: models.PlanPlus, allowed: false},
		{plan: models.PlanFree, allowed: false},
		{plan: models.PlanFree, role: "admin", allowed: true},
	} {
		creator := &OmniChatIAICreator{users: stubUserReader{
			user: &models.User{ID: 1, Plan: testCase.plan, Role: testCase.role},
		}}
		entitled, _ := creator.allowance(context.Background(), 1)
		require.Equal(t, testCase.allowed, entitled, "%s/%s", testCase.plan, testCase.role)
	}
}

func TestEveryEntitlementFailurePathRefuses(t *testing.T) {
	// A lookup outage must never hand somebody a character they cannot have.
	// Refusing costs them a retry; the other way costs the rule.
	lapsed := time.Now().Add(-time.Hour)
	for name, creator := range map[string]*OmniChatIAICreator{
		"no reader":     {},
		"lookup failed": {users: stubUserReader{err: errors.New("database down")}},
		"no such user":  {users: stubUserReader{}},
		"lapsed plan": {users: stubUserReader{
			user: &models.User{ID: 1, Plan: models.PlanPremium, PlanExpiresAt: &lapsed},
		}},
	} {
		allowed, limit := creator.allowance(context.Background(), 1)
		require.False(t, allowed, name)
		require.Zero(t, limit, "%s: a refusal allows nothing", name)
	}

	premium := &OmniChatIAICreator{users: stubUserReader{user: &models.User{ID: 1, Plan: models.PlanPremium}}}
	allowed, _ := premium.allowance(context.Background(), 0)
	require.False(t, allowed, "an unauthenticated caller is nobody")
}

func TestCreationRefusesWhatItCannotMake(t *testing.T) {
	creator := NewOmniChatIAICreator(nil, nil)

	_, err := creator.Create(t.Context(), 1, IAIAnswers{Name: "Sam"})
	require.Error(t, err, "no repository means creation is unavailable, not silently skipped")

	// And a name is the one thing she cannot be made without.
	unavailable := &OmniChatIAICreator{}
	_, err = unavailable.Create(t.Context(), 1, IAIAnswers{Name: "   "})
	require.Error(t, err)
}

func TestAnAdminIsNotHeldToTheOneCharacterLimit(t *testing.T) {
	// Admins already passed the premium requirement and already got the top
	// roleplay allowance. The one-character cap was a flat constant that never
	// asked who was calling, so an admin could clear the entitlement and still
	// be refused by a limit meant for everybody else -- which makes the one
	// account that has to be able to test a second character unable to make one.
	admin := &OmniChatIAICreator{users: stubUserReader{
		user: &models.User{ID: 1, Plan: models.PlanFree, Role: "admin"},
	}}
	allowed, limit := admin.allowance(context.Background(), 1)

	require.True(t, allowed, "and the plan does not matter for an admin")
	require.Greater(t, limit, OmniChatIAILimit)

	// Everybody else still gets one, which is the rule rather than a shortage:
	// keeping one alive is what makes her memory and her drift mean anything.
	paying := &OmniChatIAICreator{users: stubUserReader{
		user: &models.User{ID: 2, Plan: models.PlanPremium},
	}}
	allowedToo, theirLimit := paying.allowance(context.Background(), 2)
	require.True(t, allowedToo)
	require.Equal(t, OmniChatIAILimit, theirLimit)
}
