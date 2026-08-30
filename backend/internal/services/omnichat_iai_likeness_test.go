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

func TestTheLikenessPromptNeverContradictsItsOwnMedium(t *testing.T) {
	// The scene prompt had this fault and I wrote it again here: an opening
	// line calling the output a photograph, and a closing line saying it is not
	// one. Reading the prompt is what caught it both times.
	anime := BuildIAILikenessPrompt(models.OmniChatMediaIdentityProfile{
		RenderStyle: models.OmniChatRenderStyleAnime,
		Appearance:  "A 22-year-old woman with long pink hair and violet eyes.",
	})
	require.Contains(t, anime, "anime artwork")
	require.NotContains(t, anime, "photograph of")
	require.NotContains(t, anime, "photorealistically")

	realistic := BuildIAILikenessPrompt(models.OmniChatMediaIdentityProfile{
		Appearance: "A 27-year-old woman.",
	})
	require.Contains(t, realistic, "photorealistically")
	require.NotContains(t, realistic, "anime")
}

func TestTheLikenessAsksForWhatThreeThingsNeed(t *testing.T) {
	// The picked image is what somebody chose, the reference every later render
	// is conditioned on, and the one forward-facing full-body input the
	// 2D-to-3D pipeline takes. The framing has to serve all three, so it is
	// asserted rather than left to the model.
	prompt := BuildIAILikenessPrompt(models.OmniChatMediaIdentityProfile{
		Appearance: "A 27-year-old woman.",
	})
	for _, required := range []string{
		"Full body from head to feet", "facing the camera directly",
		"plain seamless background", "no props and no other people",
	} {
		require.Contains(t, prompt, required)
	}
}

func TestACharacterNobodyDescribedStillRendersSomebody(t *testing.T) {
	prompt := BuildIAILikenessPrompt(models.OmniChatMediaIdentityProfile{})
	require.Contains(t, prompt, "An adult.")
	require.NotContains(t, prompt, "person. an adult")
}

func TestALikenessOwnsItsOwnRequest(t *testing.T) {
	conversation := 7
	// Everything a caller might set that a likeness must not inherit. Found by
	// printing what the normaliser produced rather than reading it: a video was
	// accepted, the frame came back square while the prompt asks for head to
	// feet, and SFW was false only because nothing had set it.
	out, err := NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindVideo,
		DurationSeconds: 5,
		PersonaID:       1,
		Prompt:          "Full-body reference image of one person.",
		AspectRatio:     "16:9",
		ConversationID:  &conversation,
		Scene:           models.OmniChatSceneState{Location: "the park"},
		AllowNSFW:       true,
	})
	require.NoError(t, err)

	require.Equal(t, models.OmniChatMediaKindImage, out.Kind, "a clip cannot be an identity anchor")
	require.Zero(t, out.DurationSeconds)
	require.Equal(t, "9:16", out.AspectRatio, "a standing figure head to feet wants the tallest frame")
	require.Nil(t, out.ConversationID, "she has no conversation when this runs")
	require.Empty(t, out.Scene.Location)
	require.False(t, out.AllowNSFW, "a neutral reference photograph is not an entitlement to spend")

	require.Equal(t, models.OmniChatGenerationModeLikeness, out.Mode)
	require.NotNil(t, out.BillingRequired)
	require.False(t, *out.BillingRequired, "the first set is part of what making her costs")
}

func TestTheModeIsNotSomethingACallerCanAskFor(t *testing.T) {
	// The public allowlist is the contract. Somebody who could ask for likeness
	// mode directly would get a path built for a server-written prompt and pay
	// for a picture they could never see, because it never becomes an asset.
	_, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeLikeness,
		PersonaID: 1, Prompt: "give me one",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "mode is invalid")
}
