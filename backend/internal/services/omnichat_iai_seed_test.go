package services

import (
	"math"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

func sortedTemperamentKeys() []string {
	keys := IAITemperamentKeys()
	sort.Strings(keys)
	return keys
}

func TestTheAnswersOnTheFormAreTheOnesTheSpecOffers(t *testing.T) {
	// §34 lists these by name, and the interface will render whatever this
	// returns. If the two drift, somebody is offered a choice that converts to
	// nothing and gets a blanker character than they picked.
	require.Equal(t, []string{
		"blunt", "confident", "curious", "dry", "earnest", "easygoing",
		"guarded", "outgoing", "playful", "quiet", "reserved", "restless",
		"sensitive", "serious", "sharp", "steady", "tactful", "warm",
	}, sortedTemperamentKeys())

	// Feelings, not histories. §35: she has no past to describe, so the screen
	// asks how she is rather than what the two of them have been through.
	require.Equal(t, []string{
		"guarded", "neutral", "curious", "fond", "close", "devoted",
	}, IAIFeelingKeys())
	require.Equal(t, []string{"friend", "situationship", "partner", "spouse"}, IAIRelationshipKeys())
}

func TestTraitsThatAgreeReinforceAndTraitsThatConflictCancel(t *testing.T) {
	// The picks are combined over the square root of their count, which is a
	// reversal of what this file used to assert. Averaging was measured: it
	// divides every pick by three, a third of a small number falls under the
	// threshold where the prompt says anything, and 54% of the 816 possible
	// three-trait combinations produced a character who says nothing about
	// herself at all.
	//
	// So two warm answers now make her warmer than either alone. That is the
	// point: somebody who picks warm and outgoing and easygoing is asking for a
	// warm character, and the old arithmetic answered by making her unremarkable.
	warmAlone := SeedIAI([]string{"warm"}, "fond", "none").Baseline.Warmth
	bothWarm := SeedIAI([]string{"warm", "outgoing"}, "fond", "none").Baseline.Warmth
	warm, _ := findIAITemperament("warm")
	outgoing, _ := findIAITemperament("outgoing")

	require.Greater(t, bothWarm, warmAlone, "agreement has to add up to something")
	require.Less(t, bothWarm, warm.Warmth+outgoing.Warmth,
		"but not to the whole sum, or three picks would pin every warm character at the top")

	// Conflict still cancels, which is what keeps a contradictory set honest.
	conflicted := SeedIAI([]string{"warm", "guarded", "quiet"}, "fond", "none").Baseline.Warmth
	require.Less(t, conflicted, 0.2,
		"warm, guarded and quiet together is not a warm character, and should not read as one")
}

func TestNoCombinationCanLeaveTheScale(t *testing.T) {
	// Averaging could not leave -1..1 by construction, and the old comment said
	// so. The square root can, in principle, which is why the guarantee moves
	// here: every combination of up to three traits, blended, checked. A row
	// typed with too large a number fails this loudly rather than being clamped
	// into silence somewhere downstream.
	keys := IAITemperamentKeys()
	check := func(picks []string) {
		blended := SeedIAI(picks, "fond", "none").Baseline
		for name, value := range map[string]float64{
			"mood": blended.Mood, "trust": blended.Trust,
			"warmth": blended.Warmth, "firmness": blended.Firmness,
		} {
			require.GreaterOrEqual(t, value, -1.0, "%v %s", picks, name)
			require.LessOrEqual(t, value, 1.0, "%v %s", picks, name)
		}
	}
	for i := range keys {
		check([]string{keys[i]})
		for j := i + 1; j < len(keys); j++ {
			check([]string{keys[i], keys[j]})
			for k := j + 1; k < len(keys); k++ {
				check([]string{keys[i], keys[j], keys[k]})
			}
		}
	}
}

func TestEveryTraitIsSomewhereOnEveryAxis(t *testing.T) {
	// Eighteen rows of hand-written numbers. Nothing here checks that a
	// particular trait feels right -- that is a judgement -- but a value outside
	// the scale would push a blended baseline out of range, and a row of zeros
	// would be a choice that changes nothing about the character who picked it.
	for _, temperament := range iaiTemperaments {
		for name, value := range map[string]float64{
			"mood": temperament.Mood, "trust": temperament.Trust,
			"warmth": temperament.Warmth, "firmness": temperament.Firmness,
			"talkativeness": temperament.Talkativeness, "expressiveness": temperament.Expressiveness,
		} {
			require.GreaterOrEqual(t, value, -1.0, "%s %s", temperament.Key, name)
			require.LessOrEqual(t, value, 1.0, "%s %s", temperament.Key, name)
		}
		require.NotZero(t,
			temperament.Mood+temperament.Trust+temperament.Warmth+temperament.Firmness+
				temperament.Talkativeness+temperament.Expressiveness,
			"%s moves nothing, so picking it costs a slot and buys nothing", temperament.Key)
	}
}

func TestThePairsActuallyPullAgainstEachOther(t *testing.T) {
	// The table is ordered in pairs so the form reads as choices. A pair that
	// agreed on every axis would be two words for one trait, taking two of the
	// eighteen slots and offering nothing to choose between.
	pairs := [][2]string{
		{"warm", "guarded"}, {"outgoing", "quiet"}, {"playful", "serious"},
		{"blunt", "tactful"}, {"dry", "earnest"}, {"confident", "reserved"},
		{"curious", "restless"}, {"steady", "sensitive"}, {"sharp", "easygoing"},
	}
	require.Len(t, iaiTemperaments, len(pairs)*2, "every trait belongs to a pair")

	for index, pair := range pairs {
		require.Equal(t, pair[0], iaiTemperaments[index*2].Key, "pair %d sits together", index)
		require.Equal(t, pair[1], iaiTemperaments[index*2+1].Key)

		// They have to differ somewhere, not specifically on firmness. Quiet and
		// outgoing pull apart on how much they say and agree on everything else,
		// which is the whole point of that pair.
		first, _ := findIAITemperament(pair[0])
		second, _ := findIAITemperament(pair[1])
		require.NotEqual(t, first, second,
			"%s and %s would be the same answer twice", pair[0], pair[1])
	}
}

func TestPickingOneOrTwoIsAnAnswerNotAnError(t *testing.T) {
	// Three is a ceiling rather than a quota. Forcing a third makes somebody
	// choose filler, and filler becomes baseline personality she has to carry.
	one := SeedIAI([]string{"quiet"}, "fond", "none")
	quiet, _ := findIAITemperament("quiet")
	require.InDelta(t, quiet.Warmth, one.Baseline.Warmth, 0.0001,
		"one pick is that trait exactly, undiluted")

	two := SeedIAI([]string{"warm", "playful"}, "fond", "none")
	warm, _ := findIAITemperament("warm")
	playful, _ := findIAITemperament("playful")
	require.InDelta(t, (warm.Warmth+playful.Warmth)/math.Sqrt2, two.Baseline.Warmth, 0.0001)

	// And a fourth is still ignored rather than quietly averaged in.
	four := SeedIAI([]string{"warm", "playful", "quiet", "sharp"}, "fond", "none")
	three := SeedIAI([]string{"warm", "playful", "quiet"}, "fond", "none")
	require.Equal(t, three.Baseline, four.Baseline)
}

func TestATraitAndAFeelingMaySharePlainWords(t *testing.T) {
	// "Curious" is both a trait and a starting feeling, and they mean different
	// things: curious about the world, and curious about you. They live in
	// different fields and are looked up in different tables, so nothing
	// resolves one as the other -- but the form shows both words, and this test
	// exists so a rename of either is a deliberate act rather than a surprise.
	trait, foundTrait := findIAITemperament("curious")
	feeling, foundFeeling := findIAIFeeling("curious")

	require.True(t, foundTrait)
	require.True(t, foundFeeling)
	require.NotEqual(t, trait.Warmth, feeling.Warmth, "they are not the same answer")
}

func TestQuietAndReservedAreDifferentWords(t *testing.T) {
	// Quiet is how much she says. Reserved is how much feeling is in it. Before
	// speech had an axis, both were being recorded as coldness and suspicion,
	// which made a quiet character neither quiet nor herself.
	quiet, _ := findIAITemperament("quiet")
	reserved, _ := findIAITemperament("reserved")

	require.Less(t, quiet.Talkativeness, -0.4, "quiet is chiefly about saying less")
	require.Greater(t, quiet.Expressiveness, -0.3,
		"and not about hiding what she feels -- a quiet person is not a shy one")

	require.InDelta(t, 0.0, reserved.Talkativeness, 0.0001,
		"reserved can write at length; that is not what the word means")
	require.Less(t, reserved.Expressiveness, -0.4, "what it means is that little of her is in it")

	// Neither is coldness or suspicion any more.
	for _, trait := range []iaiTemperament{quiet, reserved} {
		require.InDelta(t, 0.0, trait.Warmth, 0.0001, "%s is not cold", trait.Key)
		require.InDelta(t, 0.0, trait.Trust, 0.0001, "%s is not guarded", trait.Key)
	}
}

func TestDevotedMeansAttachedToSomebody(t *testing.T) {
	// The defect this replaced. Every starting state set warmth and trust and
	// nothing else, so a creator who chose "devoted" got a character attached to
	// nobody -- the word promising one thing and the record holding another.
	devoted := SeedIAI(nil, "devoted", "none").Relationship
	neutral := SeedIAI(nil, "neutral", "none").Relationship

	require.Greater(t, devoted.Attachment, 0.5, "devoted is a word about what her absence would cost")
	require.Equal(t, 0.0, neutral.Attachment, "and a stranger is attached to nobody, correctly")

	// Attachment rises with the ladder, in step with but not equal to warmth.
	previous := -1.0
	for _, key := range IAIFeelingKeys() {
		state := SeedIAI(nil, key, "none").Relationship
		require.GreaterOrEqual(t, state.Attachment, previous, "%s went backwards", key)
		previous = state.Attachment
	}
}

func TestAttractionComesFromTheRelationshipNotItsOwnQuestion(t *testing.T) {
	// The You screen used to ask how drawn to you she is beside how she feels
	// about you, so somebody making a friend was handed a question about
	// attraction they had not come for. Naming the relationship answers it.
	friend := SeedIAI(nil, "close", "friend").Relationship
	require.Greater(t, friend.Trust, 0.5, "as close as the flow allows")
	require.Equal(t, 0.0, friend.Attraction, "and nothing romantic is invented")

	spouse := SeedIAI(nil, "close", "spouse").Relationship
	require.Greater(t, spouse.Attraction, 0.6)

	// The feeling still owns how she feels. A guarded spouse is a marriage in a
	// bad month, and the answer survives the relationship being named.
	wary := SeedIAI(nil, "guarded", "spouse").Relationship
	require.Less(t, wary.Trust, 0.0, "she does not trust him")
	require.Greater(t, wary.Attraction, 0.6, "and is married to him anyway")
}

func TestTheRelationshipOnlyRaisesTheAttachmentFloor(t *testing.T) {
	// A husband starts past the part where you become attached, but naming him
	// must not overwrite a feeling that already said more than he does.
	guarded := SeedIAI(nil, "guarded", "spouse").Relationship
	require.InDelta(t, 0.50, guarded.Attachment, 0.001, "the relationship lifts a low feeling")

	devoted := SeedIAI(nil, "devoted", "spouse").Relationship
	require.InDelta(t, 0.85, devoted.Attachment, 0.001, "and never lowers a high one")
}

func TestAnUnknownRelationshipIsFriendship(t *testing.T) {
	// Silence is friendship. A form that gains an option before this table does
	// should make a plainer relationship, not a romance nobody asked for.
	seed := SeedIAI(nil, "fond", "nonsense")
	require.Equal(t, "friend", seed.Kind)
	require.Equal(t, 0.0, seed.Relationship.Attraction)
	require.Equal(t, "friend", NormaliseIAIRelationshipKind(""))
}

func TestBesottedIsGoneAndIndifferentBecameNeutral(t *testing.T) {
	// Besotted was a word about attraction sitting on a scale about trust, which
	// is what made the two impossible to tell apart. Indifferent said she does
	// not care, which is a judgement about somebody she has not met; neutral is
	// the honest zero.
	keys := IAIFeelingKeys()
	require.NotContains(t, keys, "besotted")
	require.NotContains(t, keys, "indifferent")
	require.Contains(t, keys, "neutral")
	require.Contains(t, keys, "guarded", "not trusting somebody yet is a real place to start")

	// A key the form no longer offers seeds nothing rather than erroring, so a
	// stale client costs a detail and not the character.
	stale := SeedIAI(nil, "besotted", "friend").Relationship
	require.Equal(t, 0.0, stale.Warmth)
	require.Equal(t, 0.0, stale.Trust)
	require.Equal(t, 0.0, stale.Attachment)
}

func TestNoRelationshipSeedsANegativeAttraction(t *testing.T) {
	// The database refuses one and so does the table. Repulsion is not the other
	// end of this scale.
	for _, kind := range iaiRelationshipKinds {
		require.GreaterOrEqual(t, kind.Attraction, 0.0, "%s", kind.Key)
		require.LessOrEqual(t, kind.Attraction, 1.0, "%s", kind.Key)
		require.GreaterOrEqual(t, kind.Attachment, 0.0, "%s", kind.Key)
		require.LessOrEqual(t, kind.Attachment, 1.0, "%s", kind.Key)
	}
}
