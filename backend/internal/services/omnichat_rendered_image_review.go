package services

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/services/openrouter"
)

// OpenRouterRenderedImageReview looks at a picture the provider actually
// returned, before anybody can see it.
//
// Every other control in this pipeline governs what may be *asked for*. The
// entitlement decides who may request explicit content; the prompt asks for
// clothes and names what it does not want. None of them governs what comes
// back. On 2 September a likeness rendered with AllowNSFW false, the
// entitlement disabled, and "nude", "topless" and "bare midriff" all in the
// negative prompt -- and returned an exposed subject. A later one returned two
// women, one of them exposed, against a negative prompt that named "second
// subject" and "another woman" in those words.
//
// Prompt wording shifts a distribution. It does not draw a boundary. This does.
//
// It runs only where explicit output would be a defect. A render the account is
// entitled to make explicit is not this classifier's business, so an entitled
// render costs nothing and waits for nothing.
type OpenRouterRenderedImageReview struct {
	client chatCompletionClient
	model  string
}

func NewOpenRouterRenderedImageReview(client chatCompletionClient) *OpenRouterRenderedImageReview {
	return &OpenRouterRenderedImageReview{client: client}
}

// omniChatRenderedImageMaxBytes bounds what is sent for review.
//
// A base64 data URI is a third larger than the file, and a rendered PNG at
// 9:16 is around a megabyte. Anything far above that is not a photograph of a
// person and refusing to review it is safer than paying to look.
const omniChatRenderedImageMaxBytes = 12 << 20

// A character's own portrait is held to a stricter standard than a scene.
//
// The explicit standard asks whether a picture is 18+. A portrait has to clear
// a second bar that has nothing to do with safety: it is the first thing
// somebody sees of a character they are about to know, and it should look like
// a person they are meeting rather than a body being presented. A bare midriff
// is not explicit and is still wrong here.
//
// Kept separate because a scene photo is not held to it. Somebody at a beach
// in a scene may show a midriff; the character's portrait may not.
type OmniChatImageStandard string

const (
	OmniChatImageStandardExplicit OmniChatImageStandard = "explicit"
	OmniChatImageStandardPortrait OmniChatImageStandard = "portrait"
	// OmniChatImageStandardReference judges the pictures nobody is shown.
	//
	// It exists because the portrait standard was applied to them and refuses
	// four of the five outright. That standard only passes a subject "facing
	// the camera, looking warm and approachable", and the five references are
	// prompted for the opposite on purpose: two are neutral, two are turned
	// three-quarters, and expression and angle variety is the entire reason
	// there are five rather than one. A refusal there is permanent, so the set
	// that carries her identity into every later render would have come back
	// with one picture in it.
	//
	// What it keeps is coverage, one person, and nothing sexual. What it drops
	// is pose and expression, which are the anchor's rules and were never these.
	OmniChatImageStandardReference OmniChatImageStandard = "reference"
)

const omniChatRenderedPortraitSystemPrompt = `You are checking one image against the standard for a character's introduction portrait. Reply with exactly PASS or FAIL and nothing else.

Reply FAIL if any of these is true:
- Any part of the abdomen, midriff, stomach, waist or navel is visible.
- The top is a crop top, cropped shirt, sports bra, bralette, halter top, tube top, or is tied or cut to expose the torso.
- Exposed genitals, buttocks, nipples, underboob or sideboob.
- The subject is nude, in underwear, in lingerie, in swimwear, or bare below the waist.
- The pose or expression is sexual, seductive, sultry or alluring rather than warm and friendly.
- More than one person is in the frame.

Reply PASS only for a single fully clothed person whose torso is completely covered from the shoulders to below the waistband, facing the camera, looking warm and approachable.

Judge only what is visible. Do not explain.`

const omniChatRenderedReferenceSystemPrompt = `You are checking one image against the standard for a private identity reference photograph. Reply with exactly PASS or FAIL and nothing else.

Reply FAIL if any of these is true:
- Any part of the abdomen, midriff, stomach, waist or navel is visible.
- The top is a crop top, cropped shirt, sports bra, bralette, halter top, tube top, or is tied or cut to expose the torso.
- Exposed genitals, buttocks, nipples, underboob or sideboob.
- The subject is nude, in underwear, in lingerie, in swimwear, or bare below the waist.
- The pose is sexual or the clothing is arranged to display the body.
- More than one person is in the frame.

Reply PASS for a single clothed person whose torso is covered from the shoulders to below the waistband. Any camera angle passes, including a three-quarter turn or a subject in profile. Any expression passes, including a neutral or unsmiling one. Judge clothing and framing only, never pose or mood.

Judge only what is visible. Do not explain.`

const omniChatRenderedImageSystemPrompt = `You are looking at one image produced by an image generator for a product where explicit content is currently switched off. Reply with exactly EXPLICIT or CLEAN and nothing else.

Reply EXPLICIT if the image shows any of:
- Exposed genitals, buttocks, or female nipples or areolae, including partial exposure such as underboob or sideboob.
- A subject nude or in underwear or lingerie, or bare below the waist.
- A sexual act, a sexual pose, or clothing arranged to display the body sexually.

Reply CLEAN for an ordinary clothed person, whatever they are wearing and whatever their pose, including swimwear on a beach, athletic clothing, and tight or revealing everyday clothes that still cover the areas named above.

Judge only what is visible. Do not infer from the setting, and do not explain.`

// ReviewRenderedImage reports whether the file at path is explicit.
//
// It fails CLOSED, deliberately, and the opposite way to the prompt moderator
// beside it. That one fails open because it guards a rare category on a path
// where a third party having a bad day would otherwise break generation for
// everybody. This one guards the common case on a path where the cost of being
// wrong is an explicit picture reaching somebody who did not ask for one, while
// the cost of being cautious is a render that has to be tried again -- and the
// credits for it come back on their own, because a failed job is already
// refunded.
func (r *OpenRouterRenderedImageReview) ReviewRenderedImage(ctx context.Context, path, contentType string) (bool, error) {
	return r.ReviewRenderedImageAgainst(ctx, path, contentType, OmniChatImageStandardExplicit)
}

// ReviewRenderedImageAgainst reports whether the file at path fails the given
// standard.
func (r *OpenRouterRenderedImageReview) ReviewRenderedImageAgainst(
	ctx context.Context, path, contentType string, standard OmniChatImageStandard,
) (bool, error) {
	if r == nil || r.client == nil {
		return false, errors.New("rendered image review is not configured")
	}
	dataURL, err := imageDataURL(path, contentType)
	if err != nil {
		return false, err
	}

	reviewCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	systemPrompt, refuse := omniChatRenderedImageSystemPrompt, "EXPLICIT"
	switch standard {
	case OmniChatImageStandardPortrait:
		systemPrompt, refuse = omniChatRenderedPortraitSystemPrompt, "FAIL"
	case OmniChatImageStandardReference:
		systemPrompt, refuse = omniChatRenderedReferenceSystemPrompt, "FAIL"
	}

	verdict, err := r.client.Generate(reviewCtx, []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: systemPrompt},
		{Role: openrouter.RoleUser, Content: "Classify this image.", ImageDataURLs: []string{dataURL}},
	}, func(string) {})
	if err != nil {
		// Never the image, never the path: this is private media and the point
		// of the review is that nobody has looked at it yet.
		return false, fmt.Errorf("rendered image review unavailable: %w", err)
	}

	switch answer := strings.TrimSpace(strings.ToUpper(verdict)); answer {
	case "CLEAN", "PASS":
		return false, nil
	case refuse:
		return true, nil
	default:
		// An answer nobody can read is not an answer. Treated as unavailable
		// rather than as permission, which is the whole posture of this check.
		zlog.Error().Msg("omnichat: rendered image review returned an unreadable verdict")
		return false, errors.New("rendered image review returned an unreadable verdict")
	}
}

// imageDataURL reads the rendered file into the form a vision model takes.
func imageDataURL(path, contentType string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open rendered image: %w", err)
	}
	defer func() { _ = file.Close() }()

	// One byte past the limit is enough to know it was over it.
	raw, err := io.ReadAll(io.LimitReader(file, omniChatRenderedImageMaxBytes+1))
	if err != nil {
		return "", fmt.Errorf("read rendered image: %w", err)
	}
	if len(raw) == 0 {
		return "", errors.New("rendered image is empty")
	}
	if len(raw) > omniChatRenderedImageMaxBytes {
		return "", fmt.Errorf("rendered image is larger than %d bytes", omniChatRenderedImageMaxBytes)
	}

	mediaType := strings.TrimSpace(contentType)
	if !strings.HasPrefix(mediaType, "image/") {
		// The review is for pictures. Anything else is refused rather than
		// guessed at, and a refusal here fails closed like every other path.
		return "", fmt.Errorf("rendered image has a content type this review cannot read: %q", contentType)
	}
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
}
