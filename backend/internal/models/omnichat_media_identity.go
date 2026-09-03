package models

import "strings"

// OmniChatMediaIdentityMode controls how a persona's visual identity is
// supplied to the GPU worker. Reference conditioning is the safe baseline for
// every persona; LoRA is an optional, pre-approved profile for platform-owned
// defaults only.
type OmniChatMediaIdentityMode string

const (
	OmniChatMediaIdentityModeReference OmniChatMediaIdentityMode = "reference"
	OmniChatMediaIdentityModeLoRA      OmniChatMediaIdentityMode = "lora"
)

const OmniChatMediaIdentityAdapterIPAdapter = "ip_adapter"

// OmniChatMediaIdentityProfile is server-resolved from a persona's extension
// data. It is never accepted directly from a browser request and is carried on
// a generation job only while it is being submitted to the provider.
type OmniChatMediaIdentityProfile struct {
	Mode         OmniChatMediaIdentityMode `json:"identity_mode"`
	Adapter      string                    `json:"identity_adapter"`
	AdapterScale float64                   `json:"identity_adapter_scale"`
	// Appearance is the persona's stable physical description: hair, build,
	// age, distinguishing features. A single reference photo plus a general
	// adapter reproduces identity only weakly, so stating the invariants in
	// words is what keeps hair and colouring consistent between generations.
	// Scene state must not supply this; it does not change with the roleplay.
	Appearance string `json:"appearance,omitempty"`
	// ReferenceURLs are private identity references used only for conditioning
	// the image model. They live here, inside the persona's extensions blob,
	// because that field is `json:"-"` and never reaches a browser.
	// bot_personas.gallery_urls is the wrong home for them: it is serialized on
	// every public persona response and rendered in the persona details UI, so
	// body-reference photos placed there would be visible to all users.
	// RenderStyle is the medium she is drawn in: "realistic" or "anime".
	//
	// Empty means photorealistic, which is what every persona rendered as
	// before this field existed and what the roster still is. It is separate
	// from Appearance because identity survives the medium -- the same person
	// drawn or photographed is the same description -- and because the prompt
	// asserts the medium in a different sentence from the subject.
	RenderStyle    string   `json:"render_style,omitempty"`
	ReferenceURLs  []string `json:"reference_urls,omitempty"`
	ReferenceLimit int      `json:"reference_limit"`
	LoraModelID    string   `json:"lora_model_id,omitempty"`
	LoraWeightName string   `json:"lora_weight_name,omitempty"`
	LoraScale      float64  `json:"lora_scale,omitempty"`
	// Style is how she dresses. It lives here because it is hers in the same
	// way her appearance is -- written once, kept, and read by everything that
	// draws her -- and because this profile already has a resolver that every
	// such caller uses.
	//
	// It is not sent to the image model. Appearance and the medium are asserted
	// in the render prompt because they are invariants a diffusion model has to
	// be told every time; taste is an input to choosing an outfit, which
	// happens a step earlier, where there is no prompt budget to spend.
	Style OmniAIStyleProfile `json:"style,omitempty"`
}

// OmniChatRenderStyleAnime is the one medium that is not the default. Stated
// once here rather than as a string literal in the prompt and the creator.
const OmniChatRenderStyleAnime = "anime"

// RenderMediumSentence is the sentence that tells an image model which medium
// to work in. Empty is photorealistic: that is every persona that existed
// before the field, and the whole roster still.
//
// It lives beside the constant it reads because two callers need it -- the
// scene prompt, assembled in the queue where the persona is finally known, and
// the likeness prompt, assembled in services because a likeness is not a scene
// and never goes through the scene path. Written twice they were one sentence
// apart ("Render the image photorealistically" against "Render
// photorealistically") and a third medium would have had to be remembered in
// both.
func RenderMediumSentence(renderStyle string) string {
	if renderStyle == OmniChatRenderStyleAnime {
		return "Render as anime artwork, not as a photograph."
	}
	return "Render photorealistically."
}

// DefaultOmniChatMediaIdentityProfile is deliberately usable without any
// persona-specific configuration. A newly created default or user persona can
// therefore generate media immediately from its avatar/gallery references.
func DefaultOmniChatMediaIdentityProfile() OmniChatMediaIdentityProfile {
	return OmniChatMediaIdentityProfile{
		Mode:         OmniChatMediaIdentityModeReference,
		Adapter:      OmniChatMediaIdentityAdapterIPAdapter,
		AdapterScale: 0.65,
		// The worker encodes each reference separately and mean-pools the
		// embeddings, which is the supported way to use more than one photo.
		// A contact sheet is still not a solution: diffusers reads a list on
		// ip_adapter_image as one image per adapter and produces duplicate
		// faces. Extra references refine identity and dilute any single
		// photo's expression and lighting.
		// A persona needs separate close portraits (which carry expression
		// variety and facial detail) and full-length shots (which carry
		// proportions). Four total cannot hold both sets.
		ReferenceLimit: 6,
		LoraScale:      0.8,
	}
}

// NormalizeOmniChatMediaIdentityProfile fills omitted fields and bounds the
// numeric controls. It does not authorize a LoRA; that decision belongs to
// the service resolver, which knows whether a persona is platform-owned.
func NormalizeOmniChatMediaIdentityProfile(profile OmniChatMediaIdentityProfile) OmniChatMediaIdentityProfile {
	defaults := DefaultOmniChatMediaIdentityProfile()
	if profile.Mode == "" {
		profile.Mode = defaults.Mode
	}
	if profile.Adapter == "" {
		profile.Adapter = defaults.Adapter
	}
	if profile.AdapterScale < 0.1 || profile.AdapterScale > 1.5 {
		profile.AdapterScale = defaults.AdapterScale
	}
	if profile.ReferenceLimit < 1 || profile.ReferenceLimit > omniChatMaxReferenceURLs {
		profile.ReferenceLimit = defaults.ReferenceLimit
	}
	if profile.LoraScale < 0.1 || profile.LoraScale > 1.5 {
		profile.LoraScale = defaults.LoraScale
	}
	// An unrecognised style is photorealistic rather than a refusal. A persona
	// carrying a medium this build does not know renders as everything else
	// does, which is a plainer picture and not a failed one.
	if profile.RenderStyle != OmniChatRenderStyleAnime {
		profile.RenderStyle = ""
	}
	profile.Appearance = boundProvenanceText(profile.Appearance, omniChatMaxAppearanceRunes)
	// Bounded here for the same reason Appearance is. The writer trims what it
	// produces, but this is the read path: a profile arrives out of a jsonb
	// column that a migration, an admin edit or a future writer could have put
	// anything into, and every other text field on this struct is bounded at
	// exactly this point. A style that skipped it would be the one field able
	// to grow a prompt without limit.
	profile.Style.Taste = boundProvenanceText(profile.Style.Taste, OmniAIStyleMaxTasteRunes)
	profile.Style.SignatureItem = boundProvenanceText(profile.Style.SignatureItem, OmniAIStyleMaxSignatureItemRunes)
	profile.Style.Note = boundProvenanceText(profile.Style.Note, OmniAIStyleMaxNoteRunes)
	// Bound the private reference list the same way the public gallery is
	// bounded, so persona metadata cannot make the worker fetch arbitrarily
	// many images.
	if len(profile.ReferenceURLs) > omniChatMaxReferenceURLs {
		profile.ReferenceURLs = profile.ReferenceURLs[:omniChatMaxReferenceURLs]
	}
	cleaned := make([]string, 0, len(profile.ReferenceURLs))
	for _, url := range profile.ReferenceURLs {
		if trimmed := strings.TrimSpace(url); trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	profile.ReferenceURLs = cleaned
	return profile
}

// omniChatMaxAppearanceRunes keeps the descriptor short on purpose. It competes
// for the renderer's fixed prompt budget against the scene itself.
const omniChatMaxAppearanceRunes = 160

const omniChatMaxReferenceURLs = 8
