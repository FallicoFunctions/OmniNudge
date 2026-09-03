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
	// Described, not forbidden -- the same correction the likeness prompt got.
	// These said "no coat, no scarf and no jewellery" and "no accessories",
	// which are negations sitting in a positive prompt, and CLIP does not
	// encode negation: naming jewellery there raises its salience rather than
	// removing it. What the reference needs is plainness, so plainness is what
	// it now asks for, and the prohibitions moved to
	// omniAIReferenceNegativeAdditions where a diffusion model reads them.
	// Long-sleeved, and no wrists. Dropping the wrists took "long-sleeved" out
	// with it in the same edit, and both portraits came back sleeveless -- a
	// reference showing bare arms teaches the adapter bare arms. The sleeve
	// length has to stay; only the wrists go.
	//
	// No wrists. They were named here -- "unadorned at the neck, ears and
	// wrists" -- and a head-and-shoulders crop has no wrists in it, so naming
	// them told the model they were in frame and every portrait variant came
	// back as a three-quarter body shot. The full-body clothing below may
	// mention them; this may not.
	omniAIReferencePortraitClothing = "Wearing a plain fitted long-sleeved top with a plain neckline, " +
		"unadorned at the neck and ears."
	omniAIReferenceFullBodyClothing = "Wearing plain close-fitting clothes in one layer: a fitted " +
		"long-sleeved top tucked in, fitted full-length trousers, and flat shoes, " +
		"all plain, unpatterned and unadorned."
)

// omniAIReferenceNegativeAdditions is what a reference must not carry, stated
// where a diffusion model actually reads a prohibition.
//
// Reference-only, and deliberately not part of OmniAIRenderNegativePrompt. Her
// candidate pictures are allowed anything a body can physically wear; putting
// these in the shared list would take the hat, the headphones and the jewellery
// out of the four somebody chooses between, which is most of what makes them
// look like a person rather than a mannequin.
//
// Sunglasses and not glasses. Sunglasses hide the eyes, which is fatal for a
// face adapter. Ordinary glasses can be part of who somebody is, and her
// appearance description is free to say so -- refusing them here would put this
// list in contradiction with the sentence describing her in the same prompt,
// and nothing would report which of the two won.
const omniAIReferenceNegativeAdditions = "jewellery, necklace, earrings, watch, bracelet, rings, " +
	"hat, cap, headband, scarf, coat, jacket, bulky layers, bag, backpack, " +
	"headphones, sunglasses, patterned fabric, printed logo, graphic print"

// omniAIReferencePortraitAspect is the frame a close portrait is rendered in,
// named so the builder can tell a portrait from a full-length shot without
// matching on the variant key.
const omniAIReferencePortraitAspect = "3:4"

var omniAIReferenceVariants = []omniAIReferenceVariant{
	{
		Key:      "portrait_neutral",
		Clothing: omniAIReferencePortraitClothing,
		Aspect:   "3:4",
		Framing:  "Head and shoulders only, cropped at the chest, the face filling most of the frame, facing the camera, neutral expression.",
	},
	{
		Key:      "portrait_smiling",
		Clothing: omniAIReferencePortraitClothing,
		Aspect:   "3:4",
		// Expression variety is half of what the portraits are for. A set that
		// only ever shows one face teaches the adapter that face and nothing
		// about how she looks when she is not holding it.
		Framing: "Head and shoulders only, cropped at the chest, the face filling most of the frame, facing the camera, a small natural smile.",
	},
	{
		Key:      "portrait_three_quarter",
		Clothing: omniAIReferencePortraitClothing,
		Aspect:   "3:4",
		Framing:  "Head and shoulders only, cropped at the chest, the face filling most of the frame, turned three-quarters toward the camera, neutral expression.",
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
// faceAppearance is used for the portrait variants when one is supplied.
// Empty falls back to the full description, which is what every persona made
// before this had.
func BuildOmniAIReferencePrompt(
	profile models.OmniChatMediaIdentityProfile, variantKey, faceAppearance string,
) string {
	variant, found := findOmniAIReferenceVariant(variantKey)
	if !found {
		return ""
	}

	subject := strings.TrimSpace(profile.Appearance)
	// A portrait is cropped at the chest, so it is described from the chest up.
	if variant.Aspect == omniAIReferencePortraitAspect && strings.TrimSpace(faceAppearance) != "" {
		subject = strings.TrimSpace(faceAppearance)
	}
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
