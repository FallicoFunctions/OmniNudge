package services

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSheIsDescribedTheWayAPersonWouldBe(t *testing.T) {
	// Read the output, not the code. Assembling this from a list of clauses
	// produced "A woman with 5'6\" tall" and "a athletic build", and both
	// looked perfectly reasonable in the source.
	require.Equal(t,
		`A 27-year-old East Asian woman, 5'6" tall, with long curly black hair `+
			`worn in a high ponytail, brown eyes and an athletic build.`,
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
