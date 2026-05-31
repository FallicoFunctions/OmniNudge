# Platform External Provider Registry Design

## Summary

Add a first-class provider registry for platform post external URLs before implementing broader link-preview extraction changes.

The registry becomes the canonical source of truth for classifying external URLs attached to platform posts. It determines whether a URL belongs to a known provider, whether it should be rendered as embeddable media, whether plain article preview extraction should be skipped, and how frontend and backend layers should branch without duplicating regex logic.

This design is intentionally comprehensive. It is meant to eliminate drift between feed cards, post detail pages, and backend preview-extraction logic, while expanding supported provider coverage beyond the current ad hoc list.

## Goals

- Create a single canonical source of truth for external provider classification for platform posts.
- Preserve current behavior for existing supported providers such as YouTube.
- Expand supported provider coverage to major media and social platforms, including adult providers explicitly requested by product scope.
- Remove duplicated provider-detection logic from multiple frontend components.
- Ensure backend preview extraction can reliably skip known providers.
- Establish clear tests and change-management rules for future provider additions.

## Non-Goals

- No attempt to unify Reddit-specific provider handling in this phase.
- No attempt to create a generic code-generated media engine for every renderer quirk.
- No live provider capability discovery from third-party APIs.
- No link-preview extraction changes in this phase beyond preparing classification infrastructure.

## Current Problems

- Provider detection is duplicated across multiple frontend components.
- Different layers can drift on what counts as a known provider.
- The existing supported-provider set is incomplete for product goals.
- Link-preview extraction cannot be safely added until there is a stable definition of “known provider” versus “plain article link.”

## Scope Boundary

This registry applies to platform posts only.

It does not replace broader Reddit-media handling yet. Reddit-specific provider logic can continue to exist separately until there is a dedicated migration plan for that subsystem.

## Canonical Architecture

The registry should have three layers:

1. Canonical provider catalog
2. Shared classifier adapters for frontend and backend
3. Layer-specific render or behavior adapters

### 1. Canonical Provider Catalog

The canonical provider catalog is a repo-checked data file containing provider metadata and URL matching rules.

Recommended location:

- `shared/providers/platform-external-media.json`

This file is the source of truth for:

- provider identity
- URL matching rules
- provider family
- provider status
- render kind
- whether preview extraction should be skipped
- whether outbound title linking is allowed
- which local embed-builder or renderer adapter should be used

The catalog contains data only. It must not contain executable code.

### 2. Shared Classifier Adapters

Each runtime consumes the canonical catalog and exposes a classifier helper.

Recommended consumers:

- frontend:
  - `frontend/src/utils/platformExternalProviders.ts`
- backend:
  - `backend/internal/services/externalproviders/...`

The classifier should answer:

- does this URL match a known provider
- which provider id matched
- what provider status applies
- what render kind applies
- should plain link-preview extraction be skipped

### 3. Layer-Specific Adapters

Classification is shared, but rendering and backend behavior remain runtime-specific.

Frontend adapters map:

- `provider id` or `embed_builder_key` -> current embed URL builder or media renderer

Backend adapters map:

- `provider id` or `status` -> skip preview extraction, fallback behavior, or future provider-specific preview handling

This boundary keeps shared classification centralized without forcing every provider quirk into a giant generic abstraction.

## Provider Entry Schema

Each provider entry should support at minimum:

- `id`
- `family`
- `status`
- `match_rules`
- `render_kind`
- `skip_preview_extraction`
- `allow_title_outbound_link`
- `embed_builder_key`
- `aliases` if needed

### Field Definitions

- `id`
  - stable internal identifier such as `youtube`, `instagram`, `pornhub`
- `family`
  - broad media category such as `video`, `audio`, `gif`, `social`, `adult`
- `status`
  - one of:
    - `supported_embed`
    - `supported_preview_only`
    - `recognized_but_disabled`
- `match_rules`
  - structured matching rules, not a single free-form regex
- `render_kind`
  - one of:
    - `iframe`
    - `direct_video`
    - `direct_image`
    - `link_preview_only`
- `skip_preview_extraction`
  - whether generic article preview extraction should be skipped for this provider
- `allow_title_outbound_link`
  - whether the post title remains a clickable outbound link
- `embed_builder_key`
  - key used by frontend typed code to construct embed URLs or choose renderer behavior
- `aliases`
  - optional legacy domains or alternate hostnames

## Matching Model

Provider matching should be structured, not regex-only in component code.

Each `match_rule` should support:

- host list
- subdomain handling
- path pattern list
- optional query parameter requirements
- optional alias or legacy-domain matching

Examples:

- YouTube:
  - `youtube.com/watch`
  - `youtube.com/shorts/...`
  - `youtube.com/embed/...`
  - `youtu.be/...`
- Instagram:
  - `instagram.com/p/...`
  - `instagram.com/reel/...`
- Pornhub:
  - `pornhub.com/view_video.php?...`
  - `pornhub.com/embed/...`
- X/Twitter:
  - `x.com/.../status/...`
  - `twitter.com/.../status/...`

## URL Canonicalization

The classifier should canonicalize incoming URLs before matching.

Canonicalization rules should include:

- trim whitespace
- require valid `http` or `https`
- normalize host casing
- normalize `www` handling
- strip known tracking parameters when they are not provider-critical
- preserve provider-critical parameters such as YouTube start-time query parameters

Canonicalization is required to keep classification stable and reduce duplicated edge-case handling.

## Fallback Model

Provider handling should follow this exact order:

1. classify URL against the registry
2. if provider status is `supported_embed`, use provider-specific embed or media behavior
3. if provider status is `supported_preview_only`, skip generic article scraping and use provider-specific preview rules if defined later
4. if provider is `recognized_but_disabled`, follow the declared fallback behavior for that provider
5. if no provider matches, treat the URL as a plain external article-link candidate

This model prevents a URL from being misclassified as a generic article page when it belongs to a known provider family.

## Provider Coverage

The initial registry should deliberately cover a broad provider surface for platform posts.

### Major Video

- YouTube
- Vimeo
- Dailymotion
- Twitch
- Loom
- Wistia
- Streamable

### Short-Form And Social Video

- TikTok
- Instagram posts
- Instagram reels
- Facebook video
- X/Twitter video or post URLs that represent embeddable media

### GIF And Looping Media

- Giphy
- Tenor
- Redgifs
- Gfycat legacy redirects
- Imgur gifv or gif-to-video patterns

### Audio And Embedded Media

- Spotify
- SoundCloud
- Apple Music
- Mixcloud
- Bandcamp

### Adult Providers

- Pornhub
- Any additional adult sites explicitly approved for platform support can be added through the same registry process

Adult providers must be explicitly labeled with an `adult` family or equivalent classification. They must not be hidden as generic video providers.

## Recognition Versus Embeddability

Recognition and embeddability are not the same thing.

Some large providers may be recognized but:

- blocked by CSP
- blocked by login walls
- blocked by anti-embed restrictions
- disabled for product reasons

That is why `status` must exist independently from mere URL recognition.

The registry must support:

- `supported_embed`
- `supported_preview_only`
- `recognized_but_disabled`

This allows OmniNudge to recognize a URL cleanly without incorrectly attempting a broken embed.

## Frontend Integration

Platform-post frontend code should stop owning duplicate provider lists.

Affected areas include:

- feed cards
- post detail media rendering
- any platform-post inline preview logic

Frontend steps:

1. load and classify URL via shared provider classifier
2. branch on provider status and render kind
3. call typed local embed-builder logic using `embed_builder_key`

The frontend should not recreate raw provider regexes in multiple components once this registry exists.

## Backend Integration

The backend should use the same provider catalog for classification decisions related to link-preview extraction.

Backend steps:

1. normalize and classify the outbound URL
2. if provider status is `supported_embed`, skip generic article preview extraction
3. if provider status is `supported_preview_only`, follow provider-specific preview policy if defined
4. if provider is unknown, treat it as a plain external article link candidate

The backend classifier must stay aligned with the canonical catalog rather than maintaining an independent provider list.

## Change Management Rules

Because this registry becomes infrastructure, provider additions must have strict requirements.

Every provider addition must include:

- classifier tests
- documented status
- declared render kind
- explicit preview-extraction behavior
- frontend renderer coverage if `supported_embed`

Adult providers must also include:

- explicit family labeling
- explicit status declaration
- classification tests proving they do not fall through as generic article links

## Rollout Plan

This registry must land before link-preview extraction changes depend on it.

Recommended rollout sequence:

1. add the canonical provider catalog
2. add frontend classifier utilities that consume it
3. refactor current platform-post frontend components to use the classifier while preserving behavior
4. add backend classifier utilities using the same catalog
5. only after classification is unified, implement plain-link preview extraction based on unified provider skipping rules

That order creates a stable definition of “known provider” before preview logic depends on it.

## Testing Requirements

### Catalog And Classifier Tests

- every provider URL variant classifies to the expected provider id
- alias domains and legacy domains classify correctly
- canonicalization strips junk params but preserves provider-critical params
- unknown article URLs fall through to plain-link classification

### Frontend Tests

- existing supported platform providers such as YouTube still render unchanged
- feed cards and post detail pages classify the same URL identically
- newly added providers such as Instagram classify correctly
- recognized-but-disabled providers do not trigger broken rendering
- adult providers classify correctly under their explicit family and status

### Backend Tests

- known providers skip generic plain-article preview extraction
- unknown article links remain eligible for preview extraction
- recognized-but-disabled providers follow their declared fallback behavior
- adult providers do not fall through into generic article handling

## Open Implementation Notes

- The initial registry should focus on classification infrastructure, not on abstracting every renderer detail into data
- Reddit-specific provider support remains out of scope for this phase and can be migrated later if desired
- If a provider is recognized but not currently embeddable in OmniNudge, it should still receive a stable registry entry instead of being omitted
