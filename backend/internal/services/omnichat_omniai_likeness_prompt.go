package services

import (
	"strings"
	"unicode"
	"unicode/utf8"

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
// This is the picture somebody sees, and the only one they choose. It is not a
// reference plate.
//
// It used to be written as one: plain seamless backdrop, flat even light, no
// props, arms at the sides. Every one of those clauses is already carried by
// the five supporting references, which say them in the same words and which
// nobody is ever shown. Stating them here as well cost nothing technically and
// everything otherwise -- it produced a catalogue photograph of a person
// standing against nothing, four times, which is not somebody you want to talk
// to.
//
// So the technical constraints stay where they belong, on the five, and this
// one asks for a person somewhere real. What survives here is what a profile
// picture actually needs: her whole body, her face toward the camera, warmth,
// and the coverage rule -- which is not a framing choice and does not move.
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
	// The torso is named as one covered surface rather than as "chest and
	// midriff", because the model answers a coverage instruction by choosing a
	// garment, and a crop top is a garment that covers a chest. Overlapping the
	// waistband is the thing that has no crop-top reading. No abdomen, on
	// anybody: these are the first pictures somebody sees of a character they
	// are about to know, and a bare stomach is not what warm looks like.
	//
	// Shoulders square, because "facing the camera directly" alone produced two
	// of four from behind. A profile picture of somebody's back is not a
	// stylistic variation.
	//
	// Warm rather than neutral, because neutral is not what somebody meeting a
	// character should be handed, and because the same adult-tuned prior turns
	// an unspecified expression into a sultry one.
	// Coverage, garment by garment, because saying it in general did not work.
	// "Fully clothed in simple everyday clothes" produced a crop top and
	// nothing below the waist: one garment satisfies a general instruction.
	// Each half is named, and so are shoes, because bare feet were the next
	// thing to go.
	//
	// The torso is named as one covered surface rather than as "chest and
	// midriff", because the model answers a coverage instruction by choosing a
	// garment, and a crop top is a garment that covers a chest. Overlapping the
	// waistband is the thing that has no crop-top reading.
	//
	// This is the one clothing rule left. Everything else about what she wears
	// comes from her brief, and nothing there is restricted: if a body can
	// physically wear it, she can.
	//
	// Phrased as a constraint on the outfit already named, not as a second
	// outfit. It used to end "...with full-length trousers or a skirt to the
	// knee, and shoes", which arrives after the brief has already dressed her
	// and reads as a fresh instruction to pick clothes -- so a brief that put
	// her in a dress was followed by a sentence offering trousers.
	//
	// And phrased as a description, not a prohibition. It used to say "so that
	// no midriff, stomach or navel is visible at any point", which is a
	// negation sitting in the positive prompt -- and CLIP does not encode
	// negation. Naming the navel there raises its salience rather than
	// suppressing it, which is the most likely reason three rounds of adding
	// forbidden garments kept producing the thing they forbade: a brief
	// specifying a turtleneck came back with the turtleneck riding up.
	//
	// So this describes where the fabric is, and every prohibition lives in
	// OmniAIRenderNegativePrompt, which is the one place a diffusion model
	// actually reads them.
	omniAILikenessCoverage = "Her top is long, and its hem hangs below her hips and covers the " +
		"waistband of her trousers completely. Her legs are covered to at least the knee, and she " +
		"has shoes on."

	// Shoulders square, because "facing the camera directly" alone produced two
	// of four from behind. A profile picture of somebody's back is not a
	// stylistic variation.
	//
	// Warm rather than neutral, because neutral is not what somebody meeting a
	// character should be handed, and because the same adult-tuned prior turns
	// an unspecified expression into a sultry one.
	//
	// Nothing here fixes her arms. They were pinned to her sides and a render
	// put one above her head anyway; a pose rule that the model ignores is
	// worse than no rule, because what she does with her hands is exactly the
	// kind of detail that makes her look like a person rather than a mannequin.
	// Her brief says what she is holding, when she is holding anything.
	omniAILikenessFraming = "Full body from head to feet, standing and facing the camera, " +
		"both shoulders square to the camera, " +
		"a warm friendly expression with a natural closed-mouth smile."

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
func BuildOmniAILikenessPrompt(
	profile models.OmniChatMediaIdentityProfile, brief OmniAICandidateBrief,
) string {
	subject := strings.TrimSpace(profile.Appearance)
	if subject == "" {
		subject = omniAILikenessFallbackSubject
	}
	if brief.Validate() != nil {
		// A brief that cannot be put in a prompt is not worth half-using. The
		// fallback still puts her somewhere with light in it, which is the
		// whole point of having one.
		brief = OmniAIFallbackCandidateBrief
	}

	// Ordered as the picture is built: who she is, then what she has on, then
	// where she is standing. The coverage rule follows the outfit immediately
	// rather than sitting with the framing, because it is a statement about
	// those clothes and reads as an afterthought anywhere else.
	return joinOmniAIPromptSentences(
		// "picture", not "photograph". This prompt can end with "Render as
		// anime artwork, not as a photograph", and the scene prompt had exactly
		// that contradiction -- one sentence telling the model to photograph
		// her and another telling it not to.
		"A picture of one person, and nobody else.",
		subject,
		"She is wearing "+strings.TrimSpace(brief.Outfit),
		omniAILikenessCoverage,
		holdingSentence(brief.Holding),
		startsASentence(brief.Setting),
		omniAILikenessFraming,
		models.RenderMediumSentence(profile.RenderStyle),
	)
}

// startsASentence capitalises a brief's setting so it reads as one.
//
// A setting is written as a phrase -- "on a path between brick buildings" --
// because that is how somebody describes where a picture was taken. Joined
// as-is it landed mid-prompt in lower case, directly after a full stop, which
// is the same run-on fault joinOmniAIPromptSentences exists to prevent at the
// other end of a sentence.
func startsASentence(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	first, width := utf8.DecodeRuneInString(text)
	if first == utf8.RuneError {
		return text
	}
	return string(unicode.ToUpper(first)) + text[width:]
}

// holdingSentence is empty far more often than not, and says nothing when it is.
func holdingSentence(holding string) string {
	holding = strings.TrimSpace(holding)
	if holding == "" {
		return ""
	}
	return "She is holding " + holding
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
