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
// the same person as the picture somebody chose.
//
// Each is conditioned on the picked image, so they can drift from it. That is
// the trade the design accepted, and it is what the written description exists
// to hold down: the invariants that survive a render are stated in words, not
// left to the adapter.
type iaiReferenceVariant struct {
	Key string
	// Framing is what changes between them. Everything else about her comes
	// from the description and from the picture they are conditioned on.
	Framing string
}

var iaiReferenceVariants = []iaiReferenceVariant{
	{
		Key:     "portrait_neutral",
		Framing: "Head and shoulders, facing the camera, neutral expression.",
	},
	{
		Key: "portrait_smiling",
		// Expression variety is half of what the portraits are for. A set that
		// only ever shows one face teaches the adapter that face and nothing
		// about how she looks when she is not holding it.
		Framing: "Head and shoulders, facing the camera, a small natural smile.",
	},
	{
		Key:     "portrait_three_quarter",
		Framing: "Head and shoulders, turned three-quarters away from the camera, neutral expression.",
	},
	{
		Key:     "full_body_three_quarter",
		Framing: "Full body from head to feet, standing, turned three-quarters away from the camera.",
	},
	{
		Key: "full_body_relaxed",
		// A second full-length at a different stance. Proportions read
		// differently on a body that is not standing to attention, and a scene
		// almost never wants the anchor's pose.
		Framing: "Full body from head to feet, standing at ease with the weight on one leg.",
	},
}

// IAIReferenceVariantKeys lists the variants, in the order they are asked for.
func IAIReferenceVariantKeys() []string {
	keys := make([]string, 0, len(iaiReferenceVariants))
	for _, variant := range iaiReferenceVariants {
		keys = append(keys, variant.Key)
	}
	return keys
}

// BuildIAIReferencePrompt is the instruction for one supporting reference.
//
// It states her description again rather than relying on the picked image
// alone. The adapter carries identity weakly and the words carry it exactly, so
// a reference generated from her own picture still says who she is.
func BuildIAIReferencePrompt(profile models.OmniChatMediaIdentityProfile, variantKey string) string {
	variant, found := findIAIReferenceVariant(variantKey)
	if !found {
		return ""
	}

	subject := strings.TrimSpace(profile.Appearance)
	if subject == "" {
		subject = iaiLikenessFallbackSubject
	}

	return strings.Join([]string{
		"Reference image of one person, the same person as the supplied reference.",
		subject,
		variant.Framing,
		"Plain seamless background, even diffuse lighting with no strong shadows, no props and no other people.",
		models.RenderMediumSentence(profile.RenderStyle),
	}, " ")
}

func findIAIReferenceVariant(key string) (iaiReferenceVariant, bool) {
	key = strings.TrimSpace(strings.ToLower(key))
	for _, variant := range iaiReferenceVariants {
		if variant.Key == key {
			return variant, true
		}
	}
	return iaiReferenceVariant{}, false
}
