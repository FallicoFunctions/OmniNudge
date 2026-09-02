package services

import (
	"strings"

	"github.com/omninudge/backend/internal/models"
)

// The likeness is not a scene.
//
// PersonaPerformsAScene is false for an OmniAI (§11: no scene
// means no scene buttons), so CreateGeneration refuses her and the contextual
// prompt -- which is where the medium directive lives -- never runs for her.
// This prompt therefore states everything itself: the subject, the medium, and
// the framing.
//
// The framing is not a style choice. The picked image is three things at once:
// what somebody chose, the reference every later render is conditioned on, and
// the single forward-facing full-body input the 2D-to-3D pipeline takes. Asking
// for it once and using it for all three is what makes the 3D input incapable
// of drifting from the character somebody actually picked.
const (
	// Three things this has to say that it did not, each measured from real
	// renders rather than reasoned about:
	//
	// Clothed, garment by garment, because saying it in general did not work.
	// "Fully clothed in simple everyday clothes" produced a crop top and
	// nothing below the waist: one garment satisfies a general instruction.
	// The scene path already reasons about upper and lower body separately,
	// and it is right to -- coverage is not one fact. So each half is named,
	// and so are shoes, because bare feet were the next thing to go.
	//
	// Shoulders square, because "facing the camera directly" alone produced two
	// of four from behind. The identity anchor is also the 3D pipeline's single
	// forward-facing input, so a back view is not a stylistic variation; it is
	// an unusable input.
	//
	// Warm rather than neutral, because neutral is not what somebody meeting a
	// character should be handed, and because the same adult-tuned prior turns
	// an unspecified expression into a sultry one.
	omniAILikenessFraming = "Full body from head to feet, standing upright and facing the camera directly, " +
		"both shoulders square to the camera, " +
		"wearing a top that covers the chest and midriff, full-length trousers or a skirt to the knee, and shoes, " +
		"arms relaxed at the sides, a warm friendly expression with a natural closed-mouth smile, " +
		"plain seamless background, even diffuse lighting with no strong shadows, " +
		"no props and no other people."

	// Nothing here describes a person, so a character nobody described still
	// renders somebody rather than failing. Written as its own sentence,
	// because it is one.
	omniAILikenessFallbackSubject = "An adult."
)

// BuildOmniAILikenessPrompt is the whole instruction for her first picture.
//
// She has no avatar yet, so there is no reference image to condition on: the
// only thing carrying her identity is the description, which is exactly why it
// is written at creation rather than when something first needs to draw her.
func BuildOmniAILikenessPrompt(profile models.OmniChatMediaIdentityProfile) string {
	subject := strings.TrimSpace(profile.Appearance)
	if subject == "" {
		subject = omniAILikenessFallbackSubject
	}
	// The description is a sentence about a person ("A 27-year-old woman with
	// long black hair."). Opening with it and then stating the framing reads as
	// two instructions rather than one run-on subject.
	return joinOmniAIPromptSentences(
		// "image", not "photograph". This prompt can end with "Render as anime
		// artwork, not as a photograph", and the scene prompt had exactly this
		// contradiction two commits ago -- one sentence telling the model to
		// photograph her and another telling it not to.
		"Full-body reference image of one person.",
		subject,
		omniAILikenessFraming,
		models.RenderMediumSentence(profile.RenderStyle),
	)
}

// joinOmniAIPromptSentences puts a prompt together out of whole sentences.
//
// The appearance description is written by a model and arrives with whatever
// punctuation it felt like ending on. Joining on a space alone produced
// "freckles across her nose Head and shoulders, facing the camera" -- two
// instructions fused into one run-on that a diffusion model reads as a single
// clause. Every piece is terminated before the next one starts, for the same
// reason appendDirective does it on the contextual path.
func joinOmniAIPromptSentences(sentences ...string) string {
	assembled := make([]string, 0, len(sentences))
	for _, sentence := range sentences {
		sentence = strings.TrimRight(strings.TrimSpace(sentence), " ")
		if sentence == "" {
			continue
		}
		if last := sentence[len(sentence)-1]; last != '.' && last != '!' && last != '?' {
			sentence += "."
		}
		assembled = append(assembled, sentence)
	}
	return strings.Join(assembled, " ")
}
