package services

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func TestSheIsDescribedTheWayAPersonWouldBe(t *testing.T) {
	// Read the output, not the code. Assembling this from a list of clauses
	// produced "A woman with 5'6\" tall" and "a athletic build", and both
	// looked perfectly reasonable in the source.
	require.Equal(t,
		`A 27-year-old East Asian woman, 5'6" tall, with long curly black hair `+
			`in a high ponytail, brown eyes and an athletic build.`,
		RenderIAIAppearance(IAIAppearance{
			Style: "realistic", Gender: "woman", Age: 27, HeightInches: 66,
			Ethnicity: "east_asian", HairLength: "long", HairTexture: "curly",
			HairStyle: "high_ponytail", HairColour: "black", Eyes: "brown",
			Build: "athletic",
		}))
}

func TestTheDrawingStyleIsNotPartOfWhatSheLooksLike(t *testing.T) {
	// Identity survives the medium. What she looks like is the same fact drawn
	// or photographed, so the style belongs to the prompt that renders her.
	anime := IAIAppearance{Style: "anime", Gender: "woman", Age: 22, Eyes: "violet"}
	realistic := anime
	realistic.Style = "realistic"

	require.Equal(t, RenderIAIAppearance(realistic), RenderIAIAppearance(anime))
	require.NotContains(t, RenderIAIAppearance(anime), "anime")
}

func TestAnUnansweredScreenAddsNothing(t *testing.T) {
	// The face screens may be skipped, which is worth nothing if skipping them
	// produces a description full of detail nobody chose.
	require.Equal(t, "A 90-year-old woman, 5'0\" tall.",
		RenderIAIAppearance(IAIAppearance{Gender: "woman", Age: 90, HeightInches: 60}))
	require.Equal(t, "A man.", RenderIAIAppearance(IAIAppearance{Gender: "man"}))

	// Not even a gender: "person" rather than a guess.
	require.Equal(t, "A person.", RenderIAIAppearance(IAIAppearance{}))
}

func TestLatinaAndLatinoAreSpokenByGender(t *testing.T) {
	require.Contains(t, RenderIAIAppearance(IAIAppearance{Gender: "woman", Ethnicity: "latino"}), "Latina woman")
	require.Contains(t, RenderIAIAppearance(IAIAppearance{Gender: "man", Ethnicity: "latino"}), "Latino man")
}

func TestEveryOfferedAnswerIsSpeakable(t *testing.T) {
	// A key that reaches the prompt with its underscores intact is a description
	// telling the model about "plus_size" and "high_ponytail". Every option the
	// form offers has to come out as English.
	options := IAIAppearanceOptions()
	for field, keys := range options {
		if field == "style" || field == "gender" {
			continue
		}
		for _, key := range keys {
			appearance := IAIAppearance{Gender: "woman", Age: 30}
			switch field {
			case "ethnicity":
				appearance.Ethnicity = key
			case "hair_length":
				appearance.HairLength = key
			case "hair_texture":
				appearance.HairTexture = key
			case "hair_colour":
				appearance.HairColour = key
			}
			require.NotContains(t, RenderIAIAppearance(appearance), "_",
				"%s %q reaches the prompt as a key", field, key)
		}
	}

	for _, gender := range []string{"woman", "man"} {
		for _, build := range IAIBuilds(gender) {
			require.NotContains(t,
				RenderIAIAppearance(IAIAppearance{Gender: gender, Build: build}), "_",
				"build %q reaches the prompt as a key", build)
		}
		for _, style := range []string{"realistic", "anime"} {
			for _, eyes := range IAIEyeColours(style) {
				require.NotContains(t,
					RenderIAIAppearance(IAIAppearance{Gender: gender, Eyes: eyes}), "_",
					"eye colour %q reaches the prompt as a key", eyes)
			}
		}
	}
}

func TestTheSentencesAreReadAloudBeforeTheyAreTrusted(t *testing.T) {
	// Every one of these was found by printing the output and reading it, not
	// by reading the code, where all of them looked fine.
	for _, c := range []struct {
		was, is    string
		appearance IAIAppearance
	}{
		{"A 18-year-old woman", "An 18-year-old woman, 5'4\" tall, with a slim build.",
			IAIAppearance{Gender: "woman", Age: 18, HeightInches: 64, Build: "slim"}},
		{"A 84-year-old", "An 84-year-old mixed-race man.",
			IAIAppearance{Gender: "man", Age: 84, Ethnicity: "mixed"}},
		{"A woman, with long black hair.", "A woman with long black hair.",
			IAIAppearance{Gender: "woman", HairLength: "long", HairColour: "black"}},
		{"with hair worn in a bun", "A woman with her hair in a bun.",
			IAIAppearance{Gender: "woman", HairStyle: "bun"}},
		{"shaved coily hair", "A man with shaved hair and a fade.",
			IAIAppearance{Gender: "man", HairLength: "shaved", HairTexture: "coily", HairStyle: "fade"}},
		{"worn in a braids", "A woman with long curly hair in braids.",
			IAIAppearance{Gender: "woman", HairLength: "long", HairTexture: "curly", HairStyle: "braids"}},
		{"worn in a afro", "A woman with long coily hair in an afro.",
			IAIAppearance{Gender: "woman", HairLength: "long", HairTexture: "coily", HairStyle: "afro"}},
		{"short hair with an undercut", "A man with short hair, an undercut and an athletic build.",
			IAIAppearance{Gender: "man", HairLength: "short", HairStyle: "undercut", Build: "athletic"}},
		{"worn in a half up", "A woman with medium hair worn half up.",
			IAIAppearance{Gender: "woman", HairLength: "medium", HairStyle: "half_up"}},
	} {
		require.Equal(t, c.is, RenderIAIAppearance(c.appearance), "was: %s", c.was)
	}
}

func TestNoShapeIsSpokenWithTheWrongArticle(t *testing.T) {
	// Every shape the form offers, read in a full sentence. "a bangs", "a
	// locs" and "a afro" all shipped from one "worn in a" that looked right.
	for _, shape := range IAIHairStyles("realistic", "woman", "curly") {
		sentence := RenderIAIAppearance(IAIAppearance{
			Gender: "woman", HairLength: "long", HairTexture: "curly", HairStyle: shape,
		})
		require.NotContains(t, sentence, "_", "%s reaches the prompt as a key", shape)
		require.NotContains(t, sentence, " a a", "%s", shape)
		require.NotContains(t, sentence, " a e", "%s", shape)
		require.NotContains(t, sentence, " a i", "%s", shape)
		require.NotContains(t, sentence, " a o", "%s", shape)
		require.NotContains(t, sentence, " a u", "%s", shape)
		// A hair feature inside a sentence that already says "with".
		require.NotContains(t, sentence, "hair with", "%s", shape)
	}
}

func TestAShavedHeadHasNoTexture(t *testing.T) {
	for _, length := range []string{"shaved", "buzzed"} {
		sentence := RenderIAIAppearance(IAIAppearance{
			Gender: "man", HairLength: length, HairTexture: "coily", HairColour: "black",
		})
		require.NotContains(t, sentence, "coily",
			"%s hair has no texture left to describe", length)
		require.Contains(t, sentence, length)
		require.Contains(t, sentence, "black")
	}
}

func TestTheMediumIsRecordedBesideHerDescriptionNotInsideIt(t *testing.T) {
	// She is the same person drawn or photographed, so the medium is not part
	// of what she looks like. It is recorded so the render can state it, and
	// stated in a different sentence from the subject.
	anime, err := encodeIAIIdentity(IAIAppearance{
		Style: "anime", Gender: "woman", Age: 22, Eyes: "violet",
	})
	require.NoError(t, err)
	require.Contains(t, string(anime), `"render_style":"anime"`)
	require.NotContains(t, string(anime), `anime woman`)

	// Realistic is the default and is written as absence, so every persona made
	// before this field existed reads the same as one made after.
	realistic, err := encodeIAIIdentity(IAIAppearance{
		Style: "realistic", Gender: "woman", Age: 22,
	})
	require.NoError(t, err)
	require.NotContains(t, string(realistic), "render_style")
}

func TestAnUnknownMediumIsPhotorealisticRatherThanARefusal(t *testing.T) {
	// A persona carrying a medium this build does not know renders like
	// everything else rather than failing.
	profile := models.NormalizeOmniChatMediaIdentityProfile(
		models.OmniChatMediaIdentityProfile{RenderStyle: "claymation"})
	require.Empty(t, profile.RenderStyle)

	kept := models.NormalizeOmniChatMediaIdentityProfile(
		models.OmniChatMediaIdentityProfile{RenderStyle: models.OmniChatRenderStyleAnime})
	require.Equal(t, models.OmniChatRenderStyleAnime, kept.RenderStyle)
}

func TestNothingAnsweredStoresNothing(t *testing.T) {
	// The appearance column is left NULL when nobody answered, "rather than
	// stored as an empty object that would read later as asked and declined".
	// The identity blob guarded on the rendered sentence being empty instead --
	// and it never is, because an unanswered appearance renders as "A person."
	// So every such character was given that as her description.
	empty, err := encodeIAIIdentity(IAIAppearance{})
	require.NoError(t, err)
	require.Nil(t, empty)

	// One answer is still an answer.
	some, err := encodeIAIIdentity(IAIAppearance{Gender: "woman"})
	require.NoError(t, err)
	require.Contains(t, string(some), "A woman.")
}
