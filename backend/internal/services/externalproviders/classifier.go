package externalproviders

import (
	_ "embed"
	"encoding/json"
	"net/url"
	"slices"
	"strings"
)

type Status string

const (
	StatusSupportedEmbed        Status = "supported_embed"
	StatusSupportedPreviewOnly  Status = "supported_preview_only"
	StatusRecognizedButDisabled Status = "recognized_but_disabled"
)

type FallbackBehavior string

const (
	FallbackNone             FallbackBehavior = "none"
	FallbackTreatAsPlainLink FallbackBehavior = "treat_as_plain_link"
	FallbackRenderNoMedia    FallbackBehavior = "render_no_media"
	FallbackProviderPreview  FallbackBehavior = "provider_preview_only"
)

type RenderKind string

const (
	RenderKindIFrame          RenderKind = "iframe"
	RenderKindDirectVideo     RenderKind = "direct_video"
	RenderKindDirectImage     RenderKind = "direct_image"
	RenderKindLinkPreviewOnly RenderKind = "link_preview_only"
)

type PathMatchType string

const (
	PathMatchExact           PathMatchType = "exact"
	PathMatchPrefix          PathMatchType = "prefix"
	PathMatchSegmentTemplate PathMatchType = "segment_template"
)

type MatchRule struct {
	Hosts             []string          `json:"hosts"`
	AllowSubdomains   bool              `json:"allow_subdomains"`
	PathMatchType     PathMatchType     `json:"path_match_type"`
	PathPatterns      []string          `json:"path_patterns"`
	QueryRequirements map[string]string `json:"query_requirements"`
	Aliases           []string          `json:"aliases"`
}

type Provider struct {
	ID                     string           `json:"id"`
	Family                 string           `json:"family"`
	Status                 Status           `json:"status"`
	FallbackBehavior       FallbackBehavior `json:"fallback_behavior"`
	Priority               int              `json:"priority"`
	RenderKind             RenderKind       `json:"render_kind"`
	AllowTitleOutboundLink bool             `json:"allow_title_outbound_link"`
	EmbedBuilderKey        *string          `json:"embed_builder_key"`
	MatchRules             []MatchRule      `json:"match_rules"`
}

type providerCatalog struct {
	SchemaVersion int        `json:"schema_version"`
	Providers     []Provider `json:"providers"`
}

type matchCandidate struct {
	Provider        Provider
	ProviderIndex   int
	HostSpecificity int
	PathSpecificity int
	WildcardCount   int
}

//go:embed platform_external_media.generated.json
var catalogJSON []byte

var providers []Provider

func init() {
	var parsed providerCatalog
	if err := json.Unmarshal(catalogJSON, &parsed); err != nil {
		panic(err)
	}
	providers = parsed.Providers
}

func Classify(rawURL string) (Provider, bool) {
	target, err := url.Parse(rawURL)
	if err != nil || target.Hostname() == "" {
		return Provider{}, false
	}

	host := normalizeHost(target.Hostname())
	path := normalizePathname(target.EscapedPath())

	candidates := make([]matchCandidate, 0)
	for providerIndex, provider := range providers {
		for _, rule := range provider.MatchRules {
			hostSpecificity, ok := matchHost(host, rule)
			if !ok {
				continue
			}

			pathSpecificity, wildcardCount, ok := matchPath(path, rule)
			if !ok || !matchesQuery(target.Query(), rule.QueryRequirements) {
				continue
			}

			candidates = append(candidates, matchCandidate{
				Provider:        provider,
				ProviderIndex:   providerIndex,
				HostSpecificity: hostSpecificity,
				PathSpecificity: pathSpecificity,
				WildcardCount:   wildcardCount,
			})
		}
	}

	if len(candidates) == 0 {
		return Provider{}, false
	}

	slices.SortFunc(candidates, compareCandidates)
	return candidates[0].Provider, true
}

func compareCandidates(left, right matchCandidate) int {
	if left.HostSpecificity != right.HostSpecificity {
		return right.HostSpecificity - left.HostSpecificity
	}
	if left.PathSpecificity != right.PathSpecificity {
		return right.PathSpecificity - left.PathSpecificity
	}
	if left.WildcardCount != right.WildcardCount {
		return left.WildcardCount - right.WildcardCount
	}
	if left.Provider.Priority != right.Provider.Priority {
		return right.Provider.Priority - left.Provider.Priority
	}
	return left.ProviderIndex - right.ProviderIndex
}

func matchHost(host string, rule MatchRule) (int, bool) {
	candidates := append([]string{}, rule.Hosts...)
	candidates = append(candidates, rule.Aliases...)

	for _, candidate := range candidates {
		normalizedCandidate := normalizeHost(candidate)
		if host == normalizedCandidate {
			return 2, true
		}
		if rule.AllowSubdomains && strings.HasSuffix(host, "."+normalizedCandidate) {
			return 1, true
		}
	}

	return 0, false
}

func matchPath(path string, rule MatchRule) (int, int, bool) {
	bestSpecificity := 0
	bestWildcards := 0
	matched := false

	for _, pattern := range rule.PathPatterns {
		normalizedPattern := normalizePathname(pattern)

		switch rule.PathMatchType {
		case PathMatchExact:
			if path == normalizedPattern {
				bestSpecificity = max(bestSpecificity, 3)
				bestWildcards = 0
				matched = true
			}
		case PathMatchPrefix:
			if path == normalizedPattern || strings.HasPrefix(path, normalizedPattern) {
				bestSpecificity = max(bestSpecificity, 1)
				bestWildcards = 0
				matched = true
			}
		case PathMatchSegmentTemplate:
			wildcardCount, ok := matchSegmentTemplate(path, pattern)
			if !ok {
				continue
			}
			if !matched || bestSpecificity < 2 || wildcardCount < bestWildcards {
				bestSpecificity = 2
				bestWildcards = wildcardCount
				matched = true
			}
		}
	}

	return bestSpecificity, bestWildcards, matched
}

func matchSegmentTemplate(path string, pattern string) (int, bool) {
	actualSegments := splitSegments(normalizePathname(path))
	patternSegments := splitSegments(normalizePathname(pattern))
	wildcardCount := 0
	actualIndex := 0

	for patternIndex, token := range patternSegments {
		if token == "**" {
			wildcardCount++
			return wildcardCount, true
		}

		if actualIndex >= len(actualSegments) {
			return 0, false
		}

		actual := actualSegments[actualIndex]
		switch token {
		case "*":
			wildcardCount++
		case actual:
		default:
			return 0, false
		}

		actualIndex++
		if patternIndex == len(patternSegments)-1 && actualIndex != len(actualSegments) {
			return 0, false
		}
	}

	return wildcardCount, actualIndex == len(actualSegments)
}

func matchesQuery(values url.Values, requirements map[string]string) bool {
	for key, requirement := range requirements {
		switch {
		case requirement == "present":
			if _, ok := values[key]; !ok {
				return false
			}
		case strings.HasPrefix(requirement, "exact:"):
			expected := strings.TrimPrefix(requirement, "exact:")
			if !slices.Contains(values[key], expected) {
				return false
			}
		default:
			return false
		}
	}

	return true
}

func normalizeHost(host string) string {
	normalized := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
	if strings.HasPrefix(normalized, "www.") {
		return strings.TrimPrefix(normalized, "www.")
	}
	return normalized
}

func normalizePathname(path string) string {
	if path == "" || path == "/" {
		return "/"
	}

	decoded, err := url.PathUnescape(path)
	if err != nil {
		decoded = path
	}

	collapsed := strings.ReplaceAll(decoded, "//", "/")
	for strings.Contains(collapsed, "//") {
		collapsed = strings.ReplaceAll(collapsed, "//", "/")
	}
	if strings.HasSuffix(collapsed, "/") {
		return strings.TrimSuffix(collapsed, "/")
	}
	return collapsed
}

func splitSegments(path string) []string {
	return strings.FieldsFunc(path, func(r rune) bool {
		return r == '/'
	})
}
