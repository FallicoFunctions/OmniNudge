# Link Preview Design

## Summary

Add stored preview extraction for plain external link posts without changing the current behavior for known embeddable providers such as YouTube, Vimeo, TikTok, Twitch, Dailymotion, Streamable, Redgifs, Giphy, Tenor, and similar URLs already handled by the frontend.

For plain article-style external links, OmniNudge should attempt to fetch preview metadata when a post is created or when the outbound URL is edited. If a usable preview image is found, OmniNudge stores a local copy and renders that preview in feed cards and post detail. If no usable preview is found, or if a preview later fails to load, the UI renders no media block at all.

## Goals

- Preserve current embed behavior for known external media providers.
- Add thumbnail previews for plain external article links when a usable preview image exists.
- Never show a broken-image icon for link previews.
- Keep post creation and editing reliable even when preview extraction fails.
- Keep the preview feature backend-driven rather than depending on frontend scraping.

## Non-Goals

- No backfill for existing old plain link posts.
- No live metadata fetch on every page view.
- No change to uploaded image, video, or gallery post behavior.
- No attempt in phase one to refresh stored previews unless the outbound URL itself is edited.

## Current Constraints

- Plain external link posts currently store the outbound URL in `media_url`.
- The frontend already supports known embeddable providers by deriving iframe or video embeds from `media_url`.
- The frontend cannot reliably scrape arbitrary third-party pages due to CORS and browser security constraints.
- Some link posts have no preview media and must remain valid without rendering a broken placeholder.

## Functional Design

### Post Classification

OmniNudge should treat platform posts as one of these categories:

- Native uploaded image or video posts
- Native gallery posts
- Known embeddable external media posts
- Plain external link posts

Known embeddable external media posts must continue using the current frontend embed-detection path. They are not converted into static image-preview posts.

Plain external link posts are external `http(s)` URLs that are not native uploaded media, not galleries, and not classified by the canonical platform provider registry as known external media that should bypass generic article preview extraction.

### Stored Data Contract

For plain external link posts:

- `media_url` stores the outbound article URL
- `media_type` stores `link`
- `thumbnail_url` stores the locally hosted preview image path when one exists

Recommended additive metadata fields:

- `link_preview_title`
- `link_preview_description`
- `link_preview_site_name`

These fields are optional. The first phase can ship with `thumbnail_url` and `media_type = link` only if schema scope must stay smaller, but the preferred design includes the metadata fields because they make future rendering and moderation easier.

For known embeddable external media posts:

- Preserve the current stored representation and current renderer behavior
- The post title remains a clickable outbound link
- The media area continues to use the existing embed/video renderer derived from `media_url`

The authoritative definition of a known provider comes from the platform provider registry and its shared classifier, not from ad hoc component heuristics.

### Preview Extraction Triggers

Preview extraction runs only when:

- A new plain external link post is created
- An existing post is edited and the outbound URL changes to a plain external link

Preview extraction does not run when:

- The post is an uploaded image/video/gallery post
- The URL is classified by the provider registry as a provider whose status or fallback behavior skips generic article preview extraction
- An edit changes only non-URL fields

## Backend Design

### Fetch Behavior

Preview extraction is best-effort and non-blocking.

- Post creation succeeds even if extraction fails
- Post editing succeeds even if extraction fails
- Extraction failure results in no preview metadata being stored
- No user-facing error is raised solely because preview extraction failed

The backend fetches the remote HTML page with:

- short timeouts
- bounded response size
- bounded redirect count
- HTML content-type checks before parsing

### URL Safety Rules

The fetcher must enforce SSRF protections before any outbound request:

- allow only `http` and `https`
- block localhost
- block loopback, link-local, and private IP ranges
- block internal hostnames and direct internal IP targets
- validate every redirect target with the same rules

### Preview Selection Rules

For plain external link posts, choose preview media in this order:

1. `og:image`
2. `twitter:image`
3. the first sufficiently large content image found in page markup

The content-image fallback should consider common modern attributes:

- `src`
- `srcset`
- `data-src`
- `data-srcset`

Selection should reject obvious low-value candidates such as:

- tiny images
- favicons
- logos when better candidates exist
- tracking pixels
- empty or malformed URLs

Phase one does not need to extract external video previews for article pages. Known embeddable providers already remain on the existing embed path as defined by the provider registry.

### Preview Asset Ingest

OmniNudge must not hotlink the chosen remote preview image directly.

Instead:

1. download the selected remote image
2. validate it through the same ingestion pipeline used for normal media where applicable
3. store it in OmniNudge-controlled storage
4. write the local stored path into `thumbnail_url`

Validation requirements:

- MIME sniffing, not trust by extension alone
- size caps
- image decode validation
- malware or scan hooks if the current media pipeline already requires them
- thumbnail generation or resizing according to existing media conventions if applicable

If asset ingest fails, the post remains valid and no preview is stored.

## Frontend Design

### Rendering Rules

Frontend rendering should become explicit rather than relying on broad URL heuristics.

- Native uploaded image or video posts render their current media normally
- Gallery posts render their current gallery UI normally
- Known embeddable external media posts continue using the current embed/video renderer derived from `media_url` and selected through the shared provider classifier
- Plain external link posts with `media_type = link` and a valid `thumbnail_url` render the stored preview image
- Plain external link posts with `media_type = link` and no `thumbnail_url` render no media block

The post title remains a clickable outbound link for plain external link posts and for known embeddable external media posts.

### Broken Preview Suppression

The UI must never show the browser broken-image icon for preview media.

If a preview image element fails to load:

- mark that preview as failed in component state
- remove the image element from render for that post instance
- do not retry in a loop

The result of any preview load failure is the same as having no preview: no media block is shown.

## Compatibility Requirements

Current behavior for known sites must not regress.

Examples include YouTube and other providers whose `supported_embed` status is established by the provider registry parity gate. Those posts must continue to:

- show the outbound title link
- render their current iframe or video preview behavior
- avoid being downgraded into static image previews

The new stored preview extraction path applies only to URLs that the provider registry does not classify as `supported_embed`, and only when the matched provider status or fallback behavior does not explicitly bypass generic preview extraction.

## Rollout

The rollout is additive and forward-only.

- Provider-registry rollout and parity verification must complete before link-preview extraction depends on provider classification
- Existing old plain link posts are not backfilled
- Existing old plain link posts with no preview remain valid and render with no media block
- New plain link posts and edited plain link posts can gain stored previews

This behavior is intentional product scope, not an unfinished migration.

## Testing Requirements

### Backend Tests

- plain link extraction prefers `og:image`, then `twitter:image`, then first sufficiently large content image
- pages with no usable preview image return no preview metadata and no error
- blocked/internal/private URLs are rejected safely
- slow, oversized, or redirect-heavy targets fail closed without blocking post creation
- chosen preview images go through validation and local-storage ingest
- known embeddable providers are not misclassified into the plain link-preview path
- provider-registry status and fallback behavior are honored consistently when deciding whether preview extraction should run

### Frontend Tests

- `media_type = link` with `thumbnail_url` renders the stored preview
- `media_type = link` without `thumbnail_url` renders no media block
- preview image load failure hides the preview rather than showing a broken-image icon
- known embeddable providers such as YouTube still render through the existing embed path
- title link behavior remains correct for both plain external link posts and known embeddable external media posts
- feed cards and post detail apply the same provider-registry classification outcome for the same URL

## Open Implementation Notes

- If schema additions for preview title, description, and site name are deferred, the phase-one contract still needs `media_type = link` and stored `thumbnail_url`
- If the current media pipeline has reusable helpers for download validation, storage, and scanning, the preview-ingest path should use them instead of creating a parallel weaker path
- If preview assets become orphaned after a post URL change or deletion, cleanup can be handled by existing media lifecycle tooling if available
- The link-preview feature must treat the provider registry as the source of truth for “known provider” classification once the registry parity gate has landed
