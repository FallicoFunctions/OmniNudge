package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	zlog "github.com/rs/zerolog/log"
)

// modelFallbackAttemptTimeout reserves time for the backup model inside the
// already bounded generation attempt. A free-router stall must not consume the
// entire interactive request before a known pinned fallback gets a chance.
var modelFallbackAttemptTimeout = 6 * time.Second

// OmniChatModelTier is the server-owned inference entitlement. Browser input
// never participates in this decision.
type OmniChatModelTier string

const (
	OmniChatModelTierFree    OmniChatModelTier = "free"
	OmniChatModelTierPlus    OmniChatModelTier = "plus"
	OmniChatModelTierPremium OmniChatModelTier = "premium"
)

// OmniChatPlanReader is intentionally narrow so model routing can read the
// authoritative database entitlement without depending on payment handlers.
type OmniChatPlanReader interface {
	GetPlan(ctx context.Context, userID int) (string, *time.Time, error)
}

type OmniChatModelPreferenceReader interface {
	GetEffectiveModelKey(ctx context.Context, userID, conversationID int) (string, error)
}

type OmniChatCompletionResolver interface {
	Resolve(ctx context.Context, userID, conversationID int) (chatCompletionClient, OmniChatModelTier)
}

type omniChatCompletionProfileResolver interface {
	ResolveProfile(ctx context.Context, userID, conversationID int) (chatCompletionClient, OmniChatModelProfile)
}

// TieredOmniChatModelRouter selects a preconfigured provider client from the
// authenticated user's database plan. Unknown, expired, unreadable, and
// unconfigured entitlements fail closed to the free client.
type TieredOmniChatModelRouter struct {
	plans       OmniChatPlanReader
	preferences OmniChatModelPreferenceReader
	adminReader OmniChatAdminReader
	clients     map[OmniChatModelProfileKey]chatCompletionClient
}

// SetAdminReader makes model routing honor the persisted administrator role
// while retaining the same server-owned profile catalog and provider routes.
func (r *TieredOmniChatModelRouter) SetAdminReader(reader OmniChatAdminReader) *TieredOmniChatModelRouter {
	r.adminReader = reader
	return r
}

func NewTieredOmniChatModelRouter(
	plans OmniChatPlanReader,
	preferences OmniChatModelPreferenceReader,
	freeClient chatCompletionClient,
	plusClient chatCompletionClient,
	premiumClient chatCompletionClient,
) *TieredOmniChatModelRouter {
	return &TieredOmniChatModelRouter{
		plans:       plans,
		preferences: preferences,
		clients: map[OmniChatModelProfileKey]chatCompletionClient{
			OmniChatModelProfileStandard:     freeClient,
			OmniChatModelProfilePlus:         plusClient,
			OmniChatModelProfilePremiumQuick: premiumClient,
			OmniChatModelProfilePremiumDeep:  premiumClient,
			OmniChatModelProfileUltraFast:    premiumClient,
		},
	}
}

// NewConfiguredTieredOmniChatModelRouter converts only non-empty model IDs
// into clients. An empty paid model therefore remains genuinely unconfigured
// and uses the router's free fallback instead of producing a typed-nil trap.
func NewConfiguredTieredOmniChatModelRouter(
	plans OmniChatPlanReader,
	preferences OmniChatModelPreferenceReader,
	apiKey, freeModel, freeFallback, plusModel, plusFallback, premiumModel, premiumFallback string,
) *TieredOmniChatModelRouter {
	configuredClient := func(primary, fallback string) chatCompletionClient {
		primary = strings.TrimSpace(primary)
		fallback = strings.TrimSpace(fallback)
		if primary == "" {
			return nil
		}
		primaryClient := chatCompletionClient(openrouter.NewClient(apiKey, primary))
		if fallback == "" || fallback == primary {
			return primaryClient
		}
		return &fallbackChatCompletionClient{
			primary:  primaryClient,
			fallback: openrouter.NewClient(apiKey, fallback),
		}
	}
	profiles := DefaultOmniChatModelProfiles()
	clients := map[OmniChatModelProfileKey]chatCompletionClient{
		OmniChatModelProfileStandard:     configuredClient(freeModel, freeFallback),
		OmniChatModelProfilePlus:         configuredClient(plusModel, plusFallback),
		OmniChatModelProfilePremiumQuick: configuredClient(premiumModel, premiumFallback),
		OmniChatModelProfilePremiumDeep:  configuredClient(premiumModel, premiumFallback),
	}
	return newProfiledOmniChatModelRouter(plans, preferences, profiles, clients)
}

// NewConfiguredProfiledOmniChatModelRouter configures the five product
// profiles. Provider model IDs and tuning controls remain server-owned.
func NewConfiguredProfiledOmniChatModelRouter(
	plans OmniChatPlanReader,
	preferences OmniChatModelPreferenceReader,
	apiKey string,
	modelsByProfile map[OmniChatModelProfileKey]string,
	standardFallback string,
) *TieredOmniChatModelRouter {
	profiles := configureOmniChatProfileRoutes(DefaultOmniChatModelProfiles(), modelsByProfile)
	clients := make(map[OmniChatModelProfileKey]chatCompletionClient, len(profiles))
	for index := range profiles {
		profile := &profiles[index]
		model := strings.TrimSpace(profile.ModelKey)
		if model == "" && profile.Key == OmniChatModelProfileStandard {
			// A deployment that intentionally leaves the standard primary
			// blank must still have a usable free route when its configured
			// fallback is present. Treat that fallback as the primary route;
			// otherwise the free resolver would return a nil client.
			model = strings.TrimSpace(standardFallback)
			profile.ModelKey = model
		}
		if model == "" {
			continue
		}
		profile.ModelKey = model
		primary := chatCompletionClient(openrouter.NewClient(apiKey, model))
		if profile.Key == OmniChatModelProfileStandard {
			fallback := strings.TrimSpace(standardFallback)
			if fallback != "" && fallback != model {
				fallbackProfile := *profile
				fallbackProfile.ModelKey = fallback
				primary = &fallbackChatCompletionClient{
					primary: primary,
					fallback: &profileChatCompletionClient{
						completion: openrouter.NewClient(apiKey, fallback),
						profile:    fallbackProfile,
					},
				}
			}
		}
		clients[profile.Key] = primary
	}
	return newProfiledOmniChatModelRouter(plans, preferences, profiles, clients)
}

// ValidateConfiguredOmniChatModelRoutes checks deployment-owned route syntax
// before any provider client is constructed. Paid profiles may be left blank
// intentionally and fall back through the catalog; the standard profile must
// always have either a primary or a standard fallback route.
func ValidateConfiguredOmniChatModelRoutes(modelsByProfile map[OmniChatModelProfileKey]string, standardFallback string) error {
	known := make(map[OmniChatModelProfileKey]struct{}, len(DefaultOmniChatModelProfiles()))
	for _, profile := range DefaultOmniChatModelProfiles() {
		known[profile.Key] = struct{}{}
	}
	for key := range modelsByProfile {
		if _, ok := known[key]; !ok {
			return fmt.Errorf("omnichat model routes: unknown profile %q", key)
		}
	}
	configured := ConfiguredOmniChatModelProfiles(modelsByProfile)
	standardFallback = strings.TrimSpace(standardFallback)
	if standardFallback != "" && !openrouter.IsValidModelRoute(standardFallback) {
		return errors.New("omnichat model routes: standard fallback route is invalid")
	}
	standardConfigured := ""
	for _, profile := range configured {
		route := strings.TrimSpace(profile.ModelKey)
		if profile.Key == OmniChatModelProfileStandard {
			standardConfigured = route
			if route == "" {
				route = standardFallback
			}
		}
		if route != "" && !openrouter.IsValidModelRoute(route) {
			return fmt.Errorf("omnichat model routes: profile %q route is invalid", profile.Key)
		}
	}
	if standardConfigured == "" && standardFallback == "" {
		return errors.New("omnichat model routes: standard profile requires a primary or fallback route")
	}
	return nil
}

// ResolveConfiguredOmniChatModelRoutes returns the effective deployment route
// for every catalog profile. Blank paid routes inherit their catalog fallback;
// the standard profile uses the explicit standard fallback. The returned map
// includes unresolved keys with an empty value so callers cannot accidentally
// reintroduce a catalog default and make an unconfigured paid request.
func ResolveConfiguredOmniChatModelRoutes(modelsByProfile map[OmniChatModelProfileKey]string, standardFallback string) (map[OmniChatModelProfileKey]string, error) {
	// The resolver is used for deployment-owned maps, so an omitted profile is
	// intentionally unconfigured rather than silently inheriting the catalog's
	// example route. Config.Load supplies every key in production; normalizing
	// here keeps partial callers fail-closed as well.
	normalizedRoutes := make(map[OmniChatModelProfileKey]string, len(DefaultOmniChatModelProfiles()))
	for _, profile := range DefaultOmniChatModelProfiles() {
		route := ""
		if modelsByProfile != nil {
			route = modelsByProfile[profile.Key]
		}
		normalizedRoutes[profile.Key] = route
	}
	if modelsByProfile != nil {
		for key, route := range modelsByProfile {
			normalizedRoutes[key] = route
		}
	}
	if err := ValidateConfiguredOmniChatModelRoutes(normalizedRoutes, standardFallback); err != nil {
		return nil, err
	}
	profiles := ConfiguredOmniChatModelProfiles(normalizedRoutes)
	profilesByKey := make(map[OmniChatModelProfileKey]OmniChatModelProfile, len(profiles))
	for _, profile := range profiles {
		profilesByKey[profile.Key] = profile
	}
	resolving := make(map[OmniChatModelProfileKey]bool, len(profiles))
	var resolve func(OmniChatModelProfileKey) string
	resolve = func(key OmniChatModelProfileKey) string {
		profile, exists := profilesByKey[key]
		if !exists || resolving[key] {
			return ""
		}
		if route := strings.TrimSpace(profile.ModelKey); route != "" {
			return route
		}
		resolving[key] = true
		defer delete(resolving, key)
		if key == OmniChatModelProfileStandard {
			return strings.TrimSpace(standardFallback)
		}
		return resolve(profile.FallbackProfileKey)
	}
	routes := make(map[OmniChatModelProfileKey]string, len(profiles))
	for _, profile := range profiles {
		routes[profile.Key] = resolve(profile.Key)
	}
	return routes, nil
}

// configureOmniChatProfileRoutes returns a copy whose model metadata matches
// the deployment route actually used by each profile. Provider-specific
// controls must be derived from this route, not from catalog defaults.
func configureOmniChatProfileRoutes(profiles []OmniChatModelProfile, modelsByProfile map[OmniChatModelProfileKey]string) []OmniChatModelProfile {
	configuredRoutes := ConfiguredOmniChatModelProfiles(modelsByProfile)
	configuredByKey := make(map[OmniChatModelProfileKey]string, len(configuredRoutes))
	for _, profile := range configuredRoutes {
		configuredByKey[profile.Key] = profile.ModelKey
	}
	configured := append([]OmniChatModelProfile(nil), profiles...)
	for index := range configured {
		configured[index].ModelKey = configuredByKey[configured[index].Key]
	}
	return configured
}

func newProfiledOmniChatModelRouter(plans OmniChatPlanReader, preferences OmniChatModelPreferenceReader, profiles []OmniChatModelProfile, rawClients map[OmniChatModelProfileKey]chatCompletionClient) *TieredOmniChatModelRouter {
	primaries := make(map[OmniChatModelProfileKey]chatCompletionClient, len(profiles))
	profilesByKey := make(map[OmniChatModelProfileKey]OmniChatModelProfile, len(profiles))
	for _, profile := range profiles {
		profilesByKey[profile.Key] = profile
		if raw := rawClients[profile.Key]; raw != nil {
			primaries[profile.Key] = &profileChatCompletionClient{completion: raw, profile: profile}
		}
	}
	clients := make(map[OmniChatModelProfileKey]chatCompletionClient, len(profiles))
	building := make(map[OmniChatModelProfileKey]bool, len(profiles))
	var build func(OmniChatModelProfileKey) chatCompletionClient
	build = func(key OmniChatModelProfileKey) chatCompletionClient {
		if client, exists := clients[key]; exists {
			return client
		}
		if building[key] {
			return nil
		}
		building[key] = true
		defer delete(building, key)
		profile, exists := profilesByKey[key]
		if !exists {
			return nil
		}
		primary := primaries[key]
		fallback := build(profile.FallbackProfileKey)
		if primary == nil {
			clients[key] = fallback
			return fallback
		}
		if fallback != nil {
			primary = &fallbackChatCompletionClient{primary: primary, fallback: fallback}
		}
		clients[key] = primary
		return primary
	}
	for _, profile := range profiles {
		build(profile.Key)
	}
	return &TieredOmniChatModelRouter{plans: plans, preferences: preferences, clients: clients}
}

// profileChatCompletionClient injects immutable profile controls after all
// caller options have been assembled. A browser can therefore choose only a
// profile name, never provider effort or fast-mode flags.
type profileChatCompletionClient struct {
	completion chatCompletionClient
	profile    OmniChatModelProfile
}

// NewOmniChatProfileEvaluationClient gives offline evaluators the same
// immutable provider controls used by production profile routing. The profile
// key and controls must match the server-owned catalog; only its deployment
// model route may differ.
func NewOmniChatProfileEvaluationClient(completion PersonaQualityClient, profile OmniChatModelProfile) (PersonaQualityClient, error) {
	if completion == nil {
		return nil, errors.New("omnichat: evaluation completion client is required")
	}
	catalogProfile, found := FindOmniChatModelProfile(profile.Key)
	if !found ||
		profile.ReasoningEffort != catalogProfile.ReasoningEffort ||
		profile.Speed != catalogProfile.Speed ||
		strings.TrimSpace(profile.ModelKey) == "" {
		return nil, fmt.Errorf("omnichat: invalid evaluation profile %q", profile.Key)
	}
	return &profileChatCompletionClient{completion: completion, profile: profile}, nil
}

func (c *profileChatCompletionClient) Generate(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
	return c.GenerateWithOptions(ctx, messages, onChunk, openrouter.GenerationOptions{})
}

func (c *profileChatCompletionClient) GenerateWithOptions(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback, options openrouter.GenerationOptions) (string, error) {
	if c == nil || c.completion == nil {
		return "", errors.New("omnichat: profile completion client is unavailable")
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(c.profile.ModelKey)), "anthropic/") {
		options.ReasoningEffort = string(c.profile.ReasoningEffort)
		if c.profile.Speed == OmniChatModelSpeedFast {
			options.Speed = "fast"
		} else {
			options.Speed = ""
		}
	} else {
		options.ReasoningEffort = ""
		options.Speed = ""
	}
	return generateWithOptionalOptions(ctx, c.completion, messages, onChunk, options, true)
}

// fallbackChatCompletionClient is deliberately narrow: it retries only an
// upstream error, never a completed draft. Completed drafts still travel
// through the universal hygiene contract, where a corrective retry remains
// necessary to preserve the character's instructions.
type fallbackChatCompletionClient struct {
	primary  chatCompletionClient
	fallback chatCompletionClient
}

func (c *fallbackChatCompletionClient) Generate(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
	return c.generate(ctx, messages, onChunk, openrouter.GenerationOptions{}, false)
}

func (c *fallbackChatCompletionClient) GenerateWithOptions(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback, options openrouter.GenerationOptions) (string, error) {
	return c.generate(ctx, messages, onChunk, options, true)
}

func (c *fallbackChatCompletionClient) generate(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback, options openrouter.GenerationOptions, withOptions bool) (string, error) {
	if c == nil || c.primary == nil {
		return "", errors.New("omnichat: primary completion client is unavailable")
	}
	if c.fallback == nil {
		return generateWithOptionalOptions(ctx, c.primary, messages, onChunk, options, withOptions)
	}
	primaryCtx, cancelPrimary := context.WithTimeout(ctx, modelFallbackAttemptTimeout)
	text, err := generateWithOptionalOptions(primaryCtx, c.primary, messages, onChunk, options, withOptions)
	cancelPrimary()
	if err == nil {
		return text, nil
	}
	if ctx.Err() != nil {
		return "", err
	}
	if errors.Is(err, openrouter.ErrAccessDenied) {
		return "", err
	}
	if errors.Is(err, ErrGenerationOptionsUnsupported) {
		// A structured-output request is a server-owned contract. Do not
		// silently retry it through a client that would drop the options.
		return "", err
	}
	zlog.Warn().Msg("omnichat: primary model failed; attempting configured fallback")
	return generateWithOptionalOptions(ctx, c.fallback, messages, onChunk, options, withOptions)
}

func generateWithOptionalOptions(ctx context.Context, completion chatCompletionClient, messages []openrouter.Message, onChunk openrouter.StreamCallback, options openrouter.GenerationOptions, withOptions bool) (string, error) {
	if withOptions {
		if optioned, ok := completion.(generationOptionsClient); ok {
			return optioned.GenerateWithOptions(ctx, messages, onChunk, options)
		}
		if strings.TrimSpace(options.ResponseFormat) != "" {
			return "", ErrGenerationOptionsUnsupported
		}
	}
	return completion.Generate(ctx, messages, onChunk)
}

func (r *TieredOmniChatModelRouter) Resolve(ctx context.Context, userID, conversationID int) (chatCompletionClient, OmniChatModelTier) {
	client, profile := r.ResolveProfile(ctx, userID, conversationID)
	return client, profile.RequiredTier
}

// ResolveProfile includes the actual configured profile selected at the head
// of the fallback chain. ChatbotService uses this server-owned result to meter
// credit-backed profiles; browser model labels never determine cost.
func (r *TieredOmniChatModelRouter) ResolveProfile(ctx context.Context, userID, conversationID int) (chatCompletionClient, OmniChatModelProfile) {
	standard, _ := FindOmniChatModelProfile(OmniChatModelProfileStandard)
	if r == nil {
		return nil, standard
	}
	freeClient, _ := r.clientForProfile(OmniChatModelProfileStandard)
	if userID <= 0 || conversationID <= 0 || r.preferences == nil {
		return freeClient, standard
	}

	entitlement := OmniChatModelTierFree
	admin, err := isOmniChatAdmin(ctx, r.adminReader, userID)
	if err != nil {
		zlog.Warn().Err(err).Msg("omnichat: administrator entitlement lookup failed; using free tier")
		return freeClient, standard
	}
	if admin {
		entitlement = OmniChatModelTierPremium
	} else {
		if r.plans == nil {
			return freeClient, standard
		}
		plan, expiresAt, planErr := r.plans.GetPlan(ctx, userID)
		if planErr != nil {
			zlog.Warn().Err(planErr).Msg("omnichat: model entitlement lookup failed; using free tier")
			return freeClient, standard
		}
		if expiresAt != nil && !expiresAt.After(time.Now()) {
			return freeClient, standard
		}
		entitlement = modelTierForStoredPlan(plan)
	}
	selectedKey, err := r.preferences.GetEffectiveModelKey(ctx, userID, conversationID)
	if err != nil {
		zlog.Warn().Msg("omnichat: model preference lookup failed; using free tier")
		return freeClient, standard
	}
	profile, allowed := ResolveOmniChatModelProfile(OmniChatModelProfileKey(selectedKey), entitlement)
	if !allowed {
		zlog.Warn().Str("selected_profile", selectedKey).Str("entitlement", string(entitlement)).
			Msg("omnichat: model preference is unavailable; using free tier")
		return freeClient, standard
	}
	client, resolvedProfileKey := r.clientForProfile(profile.Key)
	if client == nil {
		if profile.Key != OmniChatModelProfileStandard {
			zlog.Warn().Str("requested_profile", string(profile.Key)).Msg("omnichat: profile model is not configured; using free tier")
		}
		return freeClient, standard
	}
	resolvedProfile, found := FindOmniChatModelProfile(resolvedProfileKey)
	if !found {
		return freeClient, standard
	}
	return client, resolvedProfile
}

func (r *TieredOmniChatModelRouter) clientForProfile(key OmniChatModelProfileKey) (chatCompletionClient, OmniChatModelProfileKey) {
	seen := make(map[OmniChatModelProfileKey]bool)
	for key != "" && !seen[key] {
		seen[key] = true
		if client := r.clients[key]; client != nil {
			return client, key
		}
		profile, found := FindOmniChatModelProfile(key)
		if !found {
			return nil, ""
		}
		key = profile.FallbackProfileKey
	}
	return nil, ""
}

func modelTierForStoredPlan(plan string) OmniChatModelTier {
	switch strings.ToLower(strings.TrimSpace(plan)) {
	case models.PlanPlus:
		return OmniChatModelTierPlus
	case models.PlanPremium:
		return OmniChatModelTierPremium
	default:
		return OmniChatModelTierFree
	}
}
