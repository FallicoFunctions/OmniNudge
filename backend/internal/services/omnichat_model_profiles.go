package services

import (
	"fmt"
	"strings"
)

// OmniChatModelProfileKey is a product offer name, not a provider-selected
// model identifier. Requests may name one of these values only.
type OmniChatModelProfileKey string

const (
	OmniChatModelProfileStandard     OmniChatModelProfileKey = "standard"
	OmniChatModelProfilePlus         OmniChatModelProfileKey = "plus"
	OmniChatModelProfilePremiumQuick OmniChatModelProfileKey = "premium_quick"
	OmniChatModelProfilePremiumDeep  OmniChatModelProfileKey = "premium_deep"
)

type OmniChatModelReasoningEffort string

const (
	OmniChatModelReasoningEffortLow    OmniChatModelReasoningEffort = "low"
	OmniChatModelReasoningEffortMedium OmniChatModelReasoningEffort = "medium"
	OmniChatModelReasoningEffortHigh   OmniChatModelReasoningEffort = "high"
)

type OmniChatModelSpeed string

const (
	OmniChatModelSpeedStandard OmniChatModelSpeed = "standard"
	OmniChatModelSpeedFast     OmniChatModelSpeed = "fast"
)

// OmniChatModelProfile holds server-owned execution metadata. ModelKey and
// tuning values are deliberately excluded from JSON so a client cannot turn a
// profile chooser into arbitrary provider configuration.
type OmniChatModelProfile struct {
	Key                OmniChatModelProfileKey      `json:"key"`
	RequiredTier       OmniChatModelTier            `json:"required_tier"`
	ModelKey           string                       `json:"-"`
	ReasoningEffort    OmniChatModelReasoningEffort `json:"-"`
	Speed              OmniChatModelSpeed           `json:"-"`
	FallbackProfileKey OmniChatModelProfileKey      `json:"-"`
}

// DefaultOmniChatModelProfiles returns a fresh copy so callers cannot mutate
// the server-owned catalog shared by later requests.
// Every profile names the same model. Not most of them -- all of them.
//
// A tier buys volume, features, and how hard she thinks. It does not buy a
// different character, and there is no longer any way to reach one: the
// credit-gated Opus profile that used to sit on top is gone. Keeping it was a
// mistake defended on the grounds that buying it was a choice, which fell apart
// on inspection -- it fell back to a different model when Opus was unavailable
// and permanently when credits ran out, so the swap was neither announced nor
// voluntary. Somebody who had talked to her for a month would simply have found
// her replaced.
//
// The ladder never bought quality anyway. On the response corpus the free model
// and Sonnet both pass 9 of 9, and the old paid middle tier passed 8.
func DefaultOmniChatModelProfiles() []OmniChatModelProfile {
	return []OmniChatModelProfile{
		{Key: OmniChatModelProfileStandard, RequiredTier: OmniChatModelTierFree, ModelKey: "google/gemini-3.5-flash-lite", ReasoningEffort: OmniChatModelReasoningEffortLow, Speed: OmniChatModelSpeedStandard},
		{Key: OmniChatModelProfilePlus, RequiredTier: OmniChatModelTierPlus, ModelKey: "google/gemini-3.5-flash-lite", ReasoningEffort: OmniChatModelReasoningEffortMedium, Speed: OmniChatModelSpeedStandard, FallbackProfileKey: OmniChatModelProfileStandard},
		{Key: OmniChatModelProfilePremiumQuick, RequiredTier: OmniChatModelTierPremium, ModelKey: "google/gemini-3.5-flash-lite", ReasoningEffort: OmniChatModelReasoningEffortLow, Speed: OmniChatModelSpeedStandard, FallbackProfileKey: OmniChatModelProfilePlus},
		{Key: OmniChatModelProfilePremiumDeep, RequiredTier: OmniChatModelTierPremium, ModelKey: "google/gemini-3.5-flash-lite", ReasoningEffort: OmniChatModelReasoningEffortHigh, Speed: OmniChatModelSpeedStandard, FallbackProfileKey: OmniChatModelProfilePremiumQuick},
	}
}

// ConfiguredOmniChatModelProfiles applies deployment routes to the same
// authoritative profile metadata used by runtime selection. Evaluators use
// this function too, preventing a second hard-coded model/profile catalog.
func ConfiguredOmniChatModelProfiles(modelsByProfile map[OmniChatModelProfileKey]string) []OmniChatModelProfile {
	profiles := DefaultOmniChatModelProfiles()
	for index := range profiles {
		if route, exists := modelsByProfile[profiles[index].Key]; exists {
			profiles[index].ModelKey = strings.TrimSpace(route)
		}
	}
	return profiles
}

// ResolveOmniChatModelProfile accepts only a named profile and an already
// server-derived entitlement. It rejects unknown raw model keys and fails
// closed if the profile is not entitled.
func ResolveOmniChatModelProfile(key OmniChatModelProfileKey, tier OmniChatModelTier) (OmniChatModelProfile, bool) {
	profile, found := FindOmniChatModelProfile(key)
	if found && omniChatModelTierRank(tier) >= omniChatModelTierRank(profile.RequiredTier) {
		return profile, true
	}
	return OmniChatModelProfile{}, false
}

// FindOmniChatModelProfile resolves only compiled product keys. It intentionally
// has no provider-model fallback, so arbitrary client strings fail closed.
func FindOmniChatModelProfile(key OmniChatModelProfileKey) (OmniChatModelProfile, bool) {
	for _, profile := range DefaultOmniChatModelProfiles() {
		if profile.Key == key {
			return profile, true
		}
	}
	return OmniChatModelProfile{}, false
}

// ValidateOmniChatModelProfileCatalog protects deployment-time catalog edits:
// a fallback must never upgrade the caller's entitlement or credit cost, and
// each chain must end rather than recurse indefinitely.
func ValidateOmniChatModelProfileCatalog(profiles []OmniChatModelProfile) error {
	if len(profiles) == 0 {
		return fmt.Errorf("omnichat model profiles: catalog is required")
	}
	byKey := make(map[OmniChatModelProfileKey]OmniChatModelProfile, len(profiles))
	for _, profile := range profiles {
		if strings.TrimSpace(string(profile.Key)) == "" {
			return fmt.Errorf("omnichat model profiles: profile key is required")
		}
		if _, exists := byKey[profile.Key]; exists {
			return fmt.Errorf("omnichat model profiles: duplicate profile key %q", profile.Key)
		}
		if omniChatModelTierRank(profile.RequiredTier) < 0 {
			return fmt.Errorf("omnichat model profiles: unknown required tier %q", profile.RequiredTier)
		}
		if strings.TrimSpace(profile.ModelKey) == "" || !validOmniChatReasoningEffort(profile.ReasoningEffort) || !validOmniChatSpeed(profile.Speed) {
			return fmt.Errorf("omnichat model profiles: profile %q has invalid server configuration", profile.Key)
		}
		byKey[profile.Key] = profile
	}
	for _, profile := range profiles {
		if err := validateKnownOmniChatProfile(profile); err != nil {
			return err
		}
		if profile.FallbackProfileKey == "" {
			continue
		}
		fallback, exists := byKey[profile.FallbackProfileKey]
		if !exists {
			return fmt.Errorf("omnichat model profiles: profile %q references unknown fallback %q", profile.Key, profile.FallbackProfileKey)
		}
		if omniChatModelTierRank(fallback.RequiredTier) > omniChatModelTierRank(profile.RequiredTier) {
			return fmt.Errorf("omnichat model profiles: fallback %q for %q increases required tier", fallback.Key, profile.Key)
		}
	}
	if err := validateOneCharacterAcrossTiers(profiles); err != nil {
		return err
	}
	for _, profile := range profiles {
		seen := map[OmniChatModelProfileKey]bool{}
		for current := profile; current.FallbackProfileKey != ""; {
			if seen[current.Key] {
				return fmt.Errorf("omnichat model profiles: fallback cycle at %q", current.Key)
			}
			seen[current.Key] = true
			current = byKey[current.FallbackProfileKey]
		}
	}
	return nil
}

// validateKnownOmniChatProfile guards what each named offer promises.
//
// It used to pin a specific model to each paid tier, which was the right
// instinct pointed at the wrong thing: those pins were what made upgrading
// hand somebody a different character. The promise worth enforcing is the
// opposite one.
func validateKnownOmniChatProfile(profile OmniChatModelProfile) error {
	switch profile.Key {
	case OmniChatModelProfilePremiumQuick:
		if profile.RequiredTier != OmniChatModelTierPremium || profile.ReasoningEffort != OmniChatModelReasoningEffortLow || profile.Speed != OmniChatModelSpeedStandard {
			return fmt.Errorf("omnichat model profiles: premium_quick must be a premium offer at low effort and standard speed")
		}
	case OmniChatModelProfilePremiumDeep:
		if profile.RequiredTier != OmniChatModelTierPremium || profile.ReasoningEffort != OmniChatModelReasoningEffortHigh || profile.Speed != OmniChatModelSpeedStandard {
			return fmt.Errorf("omnichat model profiles: premium_deep must be a premium offer at high effort and standard speed")
		}
	}
	return nil
}

// validateOneCharacterAcrossTiers is the promise that replaced the pins: every
// profile talks to the same model, so upgrading buys volume, features and how
// hard she thinks -- never a different person wearing her name.
//
// There are no exemptions. There used to be one, for a profile bought with
// credits rather than reached by subscribing, and the exemption is what let a
// paid feature quietly replace somebody's friend.
func validateOneCharacterAcrossTiers(profiles []OmniChatModelProfile) error {
	baseline := ""
	for _, profile := range profiles {
		if profile.Key == OmniChatModelProfileStandard {
			baseline = profile.ModelKey
		}
	}
	if baseline == "" {
		return nil
	}
	for _, profile := range profiles {
		if profile.ModelKey == "" || profile.ModelKey == baseline {
			continue
		}
		return fmt.Errorf(
			"omnichat model profiles: %q uses %q but subscription tiers must all use %q; a tier buys more of her, not a different her",
			profile.Key, profile.ModelKey, baseline)
	}
	return nil
}

func omniChatModelTierRank(tier OmniChatModelTier) int {
	switch tier {
	case OmniChatModelTierFree:
		return 0
	case OmniChatModelTierPlus:
		return 1
	case OmniChatModelTierPremium:
		return 2
	default:
		return -1
	}
}

func validOmniChatReasoningEffort(effort OmniChatModelReasoningEffort) bool {
	return effort == OmniChatModelReasoningEffortLow || effort == OmniChatModelReasoningEffortMedium || effort == OmniChatModelReasoningEffortHigh
}

func validOmniChatSpeed(speed OmniChatModelSpeed) bool {
	return speed == OmniChatModelSpeedStandard || speed == OmniChatModelSpeedFast
}
