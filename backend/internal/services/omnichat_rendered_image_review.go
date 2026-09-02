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
	if r == nil || r.client == nil {
		return false, errors.New("rendered image review is not configured")
	}
	dataURL, err := imageDataURL(path, contentType)
	if err != nil {
		return false, err
	}

	reviewCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	verdict, err := r.client.Generate(reviewCtx, []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: omniChatRenderedImageSystemPrompt},
		{Role: openrouter.RoleUser, Content: "Classify this image.", ImageDataURLs: []string{dataURL}},
	}, func(string) {})
	if err != nil {
		// Never the image, never the path: this is private media and the point
		// of the review is that nobody has looked at it yet.
		return false, fmt.Errorf("rendered image review unavailable: %w", err)
	}

	switch strings.TrimSpace(strings.ToUpper(verdict)) {
	case "CLEAN":
		return false, nil
	case "EXPLICIT":
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
