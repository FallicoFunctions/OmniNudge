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
	ReferenceURLs  []string `json:"reference_urls,omitempty"`
	ReferenceLimit int      `json:"reference_limit"`
	LoraModelID    string   `json:"lora_model_id,omitempty"`
	LoraWeightName string   `json:"lora_weight_name,omitempty"`
	LoraScale      float64  `json:"lora_scale,omitempty"`
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
	profile.Appearance = boundProvenanceText(profile.Appearance, omniChatMaxAppearanceRunes)
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
