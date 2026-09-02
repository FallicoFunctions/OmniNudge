package services

import (
	"strings"

	"github.com/omninudge/backend/internal/models"
)

// The pictures that make her look like herself in an ordinary scene.
//
// One reference reproduces identity only weakly -- the identity profile says so
// itself, which is why its limit is six and not one. It also says what the six
// are for: "separate close portraits (which carry expression variety and facial
// detail) and full-length shots (which carry proportions). Four total cannot
// hold both sets."
//
// So five are made when somebody picks, and the picked one joins them: three
// portraits and three full-length. They are not a second choice and nobody is
// shown them. They exist so that a scene rendered months later is recognisably
// the same person as the picture somebody chose, and they are what the 2D-to-3D
// pipeline is given.
//
// That last job used to belong to the picked image. It moved here, and it is
// the reason these look the way they do: the anchor is a photograph of her
// somewhere real, wearing what she would wear, which is the right picture for
// somebody to choose and the wrong one to measure a body from. These are the
// measuring set. Plain backdrop, flat light, close-fitting clothes, nothing to
// read but her.
//
// Each is conditioned on the picked image, so they can drift from it. That is
// the trade the design accepted, and it is what the written description exists
// to hold down: the invariants that survive a render are stated in words, not
// left to the adapter.
type omniAIReferenceVariant struct {
	Key string
	// Framing is what changes between them. Everything else about her comes
	// from the description and from the picture they are conditioned on.
	Framing string

	// Aspect follows the framing. The anchor's tall frame is right for a
	// standing figure and wrong for a face: a head-and-shoulders shot in 9:16
	// is a face in a narrow band with the rest of the picture empty.
	Aspect string

	// Clothing follows the framing too, and for a sharper reason than tidiness.
	// One sentence naming trousers and shoes was used for all five, including
	// the three head-and-shoulders shots, which cannot show either. A diffusion
	// model widens the frame to include what it is told is there, and a widened
	// portrait is a smaller face -- below OMNICHAT_FACE_MIN_CROP_PX the
	// reference is dropped from the face adapter entirely. So the crop that
	// cannot show legs is not told about them.
	Clothing string
}

// What the two framings each ask her to wear.
//
// Close-fitting and plain in both, because these carry proportions. The body
// adapter reads clothing along with the figure -- which is why its scale is set
// far below the face adapter's -- so a coat here would follow her into scenes
// as a coat-shaped body.
//
// Clothed rather than not. Underwear or nothing would describe the figure
// slightly better and would need the adult-capable checkpoint to produce, on a
// path where a render is refused if it comes back explicit. Fitted plain
// clothes reach the same proportions with none of that.
const (
	omniAIReferencePortraitClothing = "Wearing a plain fitted long-sleeved top with a plain neckline, " +
		"no coat, no scarf and no jewellery."
	omniAIReferenceFullBodyClothing = "Wearing plain close-fitting clothes: a fitted long-sleeved top tucked in, " +
		"fitted full-length trousers, and flat shoes. No coat, no bulky layers, and no accessories."
)

var omniAIReferenceVariants = []omniAIReferenceVariant{
	{
		Key:      "portrait_neutral",
		Clothing: omniAIReferencePortraitClothing,
		Aspect:   "3:4",
		Framing:  "Head and shoulders, facing the camera, neutral expression.",
	},
	{
		Key:      "portrait_smiling",
		Clothing: omniAIReferencePortraitClothing,
		Aspect:   "3:4",
		// Expression variety is half of what the portraits are for. A set that
		// only ever shows one face teaches the adapter that face and nothing
		// about how she looks when she is not holding it.
		Framing: "Head and shoulders, facing the camera, a small natural smile.",
	},
	{
		Key:      "portrait_three_quarter",
		Clothing: omniAIReferencePortraitClothing,
		Aspect:   "3:4",
		Framing:  "Head and shoulders, turned three-quarters toward the camera, neutral expression.",
	},
	{
		Key:      "full_body_three_quarter",
		Clothing: omniAIReferenceFullBodyClothing,
		Aspect:   "9:16",
		Framing:  "Full body from head to feet, standing, turned three-quarters toward the camera.",
	},
	{
		Key:      "full_body_relaxed",
		Clothing: omniAIReferenceFullBodyClothing,
		Aspect:   "9:16",
		// A second full-length at a different stance. Proportions read
		// differently on a body that is not standing to attention, and a scene
		// almost never wants the anchor's pose.
		Framing: "Full body from head to feet, standing at ease with the weight on one leg.",
	},
}

// OmniAIReferenceVariantKeys lists the variants, in the order they are asked for.
func OmniAIReferenceVariantKeys() []string {
	keys := make([]string, 0, len(omniAIReferenceVariants))
	for _, variant := range omniAIReferenceVariants {
		keys = append(keys, variant.Key)
	}
	return keys
}

// BuildOmniAIReferencePrompt is the instruction for one supporting reference.
//
// It states her description again rather than relying on the picked image
// alone. The adapter carries identity weakly and the words carry it exactly, so
// a reference generated from her own picture still says who she is.
func BuildOmniAIReferencePrompt(profile models.OmniChatMediaIdentityProfile, variantKey string) string {
	variant, found := findOmniAIReferenceVariant(variantKey)
	if !found {
		return ""
	}

	subject := strings.TrimSpace(profile.Appearance)
	if subject == "" {
		subject = omniAILikenessFallbackSubject
	}

	return joinOmniAIPromptSentences(
		// It does not claim a reference was supplied. The worker adds that
		// clause itself and only when there actually is one; saying it here as
		// well made every reference prompt assert a picture that a failed
		// avatar lookup would have left out, which is the same fault the worker
		// was fixed for.
		"Reference image of one person.",
		subject,
		variant.Framing,
		variant.Clothing,
		"Plain seamless background, even diffuse lighting with no strong shadows, no props and no other people.",
		models.RenderMediumSentence(profile.RenderStyle),
	)
}

func findOmniAIReferenceVariant(key string) (omniAIReferenceVariant, bool) {
	key = strings.TrimSpace(strings.ToLower(key))
	for _, variant := range omniAIReferenceVariants {
		if variant.Key == key {
			return variant, true
		}
	}
	return omniAIReferenceVariant{}, false
}

// OmniAIReferenceVariantAspect is the frame one variant is rendered in.
func OmniAIReferenceVariantAspect(key string) (string, bool) {
	variant, found := findOmniAIReferenceVariant(key)
	if !found {
		return "", false
	}
	return variant.Aspect, true
}
