package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTheSuggestionsFollowTheEthnicityWithoutFencingItIn(t *testing.T) {
	// A name is the first thing that makes somebody feel like a particular
	// person, so the suggestions follow the answer. But real people are named
	// across every line there is: a generator that never crossed one would be
	// asserting something about people that is not true.
	latina := IAINames("latino", "woman")

	require.Contains(t, latina, "Camila")
	require.Contains(t, latina, "Anna", "the shared pool is the softness, and it is data rather than a rule")
	require.NotContains(t, latina, "Mateo", "the men's list is a different question")
}

func TestMixedAndUnansweredGetEverything(t *testing.T) {
	// The only honest reading of "mixed", and the only safe reading of a
	// question the form has not asked yet: narrowing on no answer would be
	// choosing for somebody.
	mixed := IAINames("mixed", "woman")
	unanswered := IAINames("", "woman")

	require.Equal(t, mixed, unanswered)
	for _, name := range []string{"Camila", "Mei", "Priya", "Leilani", "Emma"} {
		require.Contains(t, mixed, name, "every list is in there")
	}
	require.Greater(t, len(mixed), len(IAINames("latino", "woman")))
}

func TestTheSameAnswerAlwaysGivesTheSameList(t *testing.T) {
	// The shuffle happens on the client, over this list. If the list itself
	// reordered between calls, two people who answered identically would be
	// offered different names -- and a shuffle would be shuffling its own source
	// as well as its own choice.
	first := IAINames("east_asian", "man")
	for i := 0; i < 5; i++ {
		require.Equal(t, first, IAINames("east_asian", "man"))
	}
}

func TestTheListHandedOutIsFreeOfRepeats(t *testing.T) {
	// What makes a uniform shuffle uniform. The mixed case concatenates every
	// list, so a name appearing in two of them would come up twice as often as
	// the rest without anything looking wrong.
	//
	// This tests the joining rather than the table: the blend deduplicates, so a
	// repeat in the source is absorbed here and cannot fail this. The table has
	// its own check below, which is the one a typo trips.
	for _, ethnicity := range append(IAIAppearanceOptions()["ethnicity"], "", "nonsense") {
		for _, gender := range []string{"woman", "man"} {
			names := IAINames(ethnicity, gender)
			require.NotEmpty(t, names, "%s/%s has nothing to suggest", ethnicity, gender)

			seen := map[string]bool{}
			for _, name := range names {
				require.False(t, seen[name], "%s appears twice for %s/%s", name, ethnicity, gender)
				seen[name] = true
			}
		}
	}
}

func TestNoSingleListRepeatsAName(t *testing.T) {
	// The check the one above cannot make. A name typed twice inside one list is
	// a typo, and the blend swallows it silently -- so the source is checked
	// directly, before anything has a chance to tidy it up.
	//
	// A name shared between two lists is not a mistake and is not checked here:
	// the shared pool exists precisely so lists overlap.
	check := func(label string, names []string) {
		seen := map[string]bool{}
		for _, name := range names {
			require.False(t, seen[name], "%s lists %s twice", label, name)
			seen[name] = true
		}
	}
	for ethnicity, byGender := range iaiNamesByEthnicity {
		for gender, names := range byGender {
			check(ethnicity+"/"+gender, names)
		}
	}
	for gender, names := range iaiSharedNames {
		check("shared/"+gender, names)
	}
}

func TestEveryNameIsAcceptableAsAName(t *testing.T) {
	// The one screen somebody types on has a 40-character cap and refuses
	// whitespace. A suggestion the form would then reject is worse than no
	// suggestion, because it looks like the product arguing with itself.
	for ethnicity, byGender := range iaiNamesByEthnicity {
		for gender, names := range byGender {
			require.Len(t, names, 8, "%s/%s", ethnicity, gender)
			for _, name := range names {
				require.NotEmpty(t, strings.TrimSpace(name))
				require.LessOrEqual(t, len([]rune(name)), omniChatIAINameRunes, "%s is too long", name)
				require.Equal(t, name, strings.TrimSpace(name), "%s has stray whitespace", name)
			}
		}
	}
}

func TestNeitherQuestionIsAnsweredOnSomebodysBehalf(t *testing.T) {
	// Two unanswered questions, one function, and they used to be handled two
	// opposite ways: an unknown ethnicity drew from every list while an unknown
	// gender quietly picked women.
	both := IAINames("latino", "")
	require.Contains(t, both, "Camila", "hers")
	require.Contains(t, both, "Mateo", "and his")

	// A question that was answered still narrows, which is the whole point of
	// asking it.
	hers := IAINames("latino", "woman")
	require.Contains(t, hers, "Camila")
	require.NotContains(t, hers, "Mateo")
	require.Less(t, len(hers), len(both))

	// And nonsense is treated as unanswered rather than as a third gender.
	require.Equal(t, both, IAINames("latino", "nonsense"))
}

func TestAnEthnicityWithNoVerifiedListFallsThroughRatherThanGuessing(t *testing.T) {
	// "Indigenous" has no list on purpose. The draft had one and it was the
	// standard baby-name-site set -- Aiyana, Nizhoni, Chenoa, Chayton, Takoda --
	// which is a genre well documented as carrying invented and misattributed
	// entries, and two of the entries were a tree and a people rather than given
	// names. None of it could be verified.
	//
	// This test is here so that adding one back is a deliberate act by somebody
	// who can vouch for it, rather than a helpful-looking fill-in.
	names := IAINames("indigenous", "woman")

	require.NotEmpty(t, names, "the option still works; it just claims nothing")
	require.Equal(t, IAINames("mixed", "woman"), names,
		"it falls through to the blend, exactly as an unanswered ethnicity does")

	for _, unverified := range []string{"Aiyana", "Nizhoni", "Chenoa", "Halona", "Chayton", "Takoda", "Sequoia"} {
		require.NotContains(t, names, unverified)
	}
}

func TestNoSuggestionIsAReferenceOrASurname(t *testing.T) {
	// Reading the lists back caught four that were not given names: a film
	// character, an endearment, a deity and a surname. A suggestion that lands
	// as a joke or a mistake costs more than a plain name gains.
	everything := append(IAINames("mixed", "woman"), IAINames("mixed", "man")...)
	for _, wrong := range []string{"Moana", "Ipo", "Mayari", "Rizal"} {
		require.NotContains(t, everything, wrong)
	}
}
