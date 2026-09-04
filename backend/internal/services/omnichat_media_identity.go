package services

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"

	"github.com/omninudge/backend/internal/models"
)

var safeLoRAModelID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)
var safeLoRAWeightName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}(?:/[A-Za-z0-9][A-Za-z0-9_.-]{0,127})*$`)

type personaMediaExtensions struct {
	OmniChatMedia *models.OmniChatMediaIdentityProfile `json:"omnichat_media"`
}

// ResolveOmniChatMediaIdentityProfile turns optional persona metadata into a
// safe provider profile. User-owned personas are permanently reference-only;
// a browser/imported card can never cause the worker to download arbitrary
// model weights. Malformed or incomplete default metadata falls back to the
// same reference path used by user-created personas.
func ResolveOmniChatMediaIdentityProfile(persona *models.BotPersona) models.OmniChatMediaIdentityProfile {
	profile := models.DefaultOmniChatMediaIdentityProfile()
	if persona == nil || len(persona.ExtensionsJSON) == 0 {
		return profile
	}
	var extensions personaMediaExtensions
	if json.Unmarshal(persona.ExtensionsJSON, &extensions) != nil || extensions.OmniChatMedia == nil {
		return profile
	}
	profile = models.NormalizeOmniChatMediaIdentityProfile(*extensions.OmniChatMedia)
	// Filled from the answers when the blob does not carry it.
	//
	// Subject decides the pronoun every sentence of her render prompt is
	// written in, and it is stored only for characters made since the field
	// existed. Falling back to "she" for the rest is what those prompts always
	// said -- and what they always said was wrong for the men among them: "A
	// man with a beard. She is wearing a jumper. Her top is long." The answers
	// have been on the row since creation, so nothing needs a migration to
	// stop saying that.
	if strings.TrimSpace(profile.Subject) == "" {
		if facts, ok := omniAIAppearanceFacts(persona); ok {
			profile.Subject = strings.ToLower(strings.TrimSpace(facts.Gender))
		}
	}
	if profile.Adapter != models.OmniChatMediaIdentityAdapterIPAdapter {
		return models.DefaultOmniChatMediaIdentityProfile()
	}
	if persona.OwnerUserID != nil || profile.Mode != models.OmniChatMediaIdentityModeLoRA {
		profile.Mode = models.OmniChatMediaIdentityModeReference
		profile.LoraModelID = ""
		profile.LoraWeightName = ""
		return profile
	}
	if profile.Adapter != models.OmniChatMediaIdentityAdapterIPAdapter ||
		!safeLoRAModelID.MatchString(strings.TrimSpace(profile.LoraModelID)) ||
		!safeLoRAWeightName.MatchString(strings.TrimSpace(profile.LoraWeightName)) {
		profile.Mode = models.OmniChatMediaIdentityModeReference
		profile.LoraModelID = ""
		profile.LoraWeightName = ""
		return profile
	}
	profile.LoraModelID = strings.TrimSpace(profile.LoraModelID)
	profile.LoraWeightName = strings.TrimSpace(profile.LoraWeightName)
	if math.IsNaN(profile.AdapterScale) || math.IsInf(profile.AdapterScale, 0) ||
		math.IsNaN(profile.LoraScale) || math.IsInf(profile.LoraScale, 0) {
		return models.DefaultOmniChatMediaIdentityProfile()
	}
	return profile
}
