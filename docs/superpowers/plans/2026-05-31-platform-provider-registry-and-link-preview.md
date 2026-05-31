# Platform Provider Registry And Link Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canonical external-provider registry for platform posts, preserve current known embed behavior, and add best-effort stored thumbnails for plain article link posts without ever showing broken preview media.

**Architecture:** Introduce one canonical provider catalog under the repo root, then generate runtime-local copies for frontend and backend so classification stays identical despite separate modules. Land the registry and parity gate first, then add backend link-preview enrichment plus explicit frontend rendering rules for `media_type = link`.

**Tech Stack:** React 19, Vite, Vitest, Go 1.26, Gin, PostgreSQL migrations, `goquery`, local/S3 storage, existing thumbnail and media validation services.

---

### Task 1: Canonical Provider Catalog And Sync Tooling

**Files:**
- Create: `shared/providers/platform-external-media.json`
- Create: `scripts/sync-platform-providers.mjs`
- Create: `frontend/src/generated/platformExternalProviders.json`
- Create: `backend/internal/services/externalproviders/platform_external_media.generated.json`
- Test: `frontend/src/utils/__tests__/platformExternalProviders.test.ts`
- Test: `backend/internal/services/externalproviders/classifier_test.go`

- [ ] **Step 1: Write the failing catalog-consumer tests**

```ts
// frontend/src/utils/__tests__/platformExternalProviders.test.ts
import { describe, expect, it } from 'vitest';
import { classifyPlatformExternalUrl } from '../platformExternalProviders';

describe('classifyPlatformExternalUrl', () => {
  it('classifies current supported embeds as supported_embed', () => {
    expect(classifyPlatformExternalUrl('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('youtube');
    expect(classifyPlatformExternalUrl('https://www.tiktok.com/@creator/video/1234567890')?.status).toBe(
      'supported_embed'
    );
  });

  it('classifies day-one recognized providers without claiming embed support', () => {
    expect(classifyPlatformExternalUrl('https://www.instagram.com/reel/Cx12345/')?.status).toBe(
      'recognized_but_disabled'
    );
    expect(classifyPlatformExternalUrl('https://www.pornhub.com/view_video.php?viewkey=ph123')?.fallbackBehavior).toBe(
      'render_no_media'
    );
  });
});
```

```go
// backend/internal/services/externalproviders/classifier_test.go
func TestClassifier_UsesGeneratedCatalog(t *testing.T) {
	result, ok := Classify("https://youtu.be/dQw4w9WgXcQ")
	require.True(t, ok)
	require.Equal(t, "youtube", result.ID)
	require.Equal(t, StatusSupportedEmbed, result.Status)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd frontend && npm test -- src/utils/__tests__/platformExternalProviders.test.ts
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services/externalproviders -count=1
```

Expected:
- frontend fails with `Cannot find module '../platformExternalProviders'`
- backend fails with `directory not found` or missing package symbols

- [ ] **Step 3: Add the canonical catalog and sync script**

```json
// shared/providers/platform-external-media.json
{
  "providers": [
    {
      "id": "youtube",
      "family": "video",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "youtube",
      "match_rules": [
        { "hosts": ["youtube.com", "www.youtube.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/watch", "/shorts/", "/embed/"], "query_requirements": {} },
        { "hosts": ["youtu.be"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "vimeo",
      "family": "video",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "vimeo",
      "match_rules": [
        { "hosts": ["vimeo.com", "www.vimeo.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "tiktok",
      "family": "social",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "tiktok",
      "match_rules": [
        { "hosts": ["tiktok.com", "www.tiktok.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/*/video/*", "/v/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "twitch",
      "family": "video",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "twitch",
      "match_rules": [
        { "hosts": ["twitch.tv", "www.twitch.tv"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/videos/*", "/*/clip/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "dailymotion",
      "family": "video",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "dailymotion",
      "match_rules": [
        { "hosts": ["dailymotion.com", "www.dailymotion.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/video/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "streamable",
      "family": "video",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "streamable",
      "match_rules": [
        { "hosts": ["streamable.com", "www.streamable.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/*", "/e/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "redgifs",
      "family": "adult",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "redgifs",
      "match_rules": [
        { "hosts": ["redgifs.com", "www.redgifs.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/watch/*", "/ifr/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "gfycat",
      "family": "gif",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 95,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "gfycat",
      "match_rules": [
        { "hosts": ["gfycat.com", "www.gfycat.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "giphy",
      "family": "gif",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "giphy",
      "match_rules": [
        { "hosts": ["giphy.com", "www.giphy.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/gifs/"], "query_requirements": {} }
      ]
    },
    {
      "id": "tenor",
      "family": "gif",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "tenor",
      "match_rules": [
        { "hosts": ["tenor.com", "www.tenor.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/view/"], "query_requirements": {} }
      ]
    },
    {
      "id": "imgur_gifv",
      "family": "gif",
      "status": "supported_embed",
      "fallback_behavior": "none",
      "priority": 100,
      "render_kind": "direct_video",
      "allow_title_outbound_link": true,
      "embed_builder_key": "imgur_gifv",
      "match_rules": [
        { "hosts": ["i.imgur.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/"], "query_requirements": {} }
      ]
    },
    {
      "id": "instagram_post",
      "family": "social",
      "status": "recognized_but_disabled",
      "fallback_behavior": "render_no_media",
      "priority": 90,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["instagram.com", "www.instagram.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/p/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "instagram_reel",
      "family": "social",
      "status": "recognized_but_disabled",
      "fallback_behavior": "render_no_media",
      "priority": 90,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["instagram.com", "www.instagram.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/reel/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "facebook_video",
      "family": "social",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 80,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["facebook.com", "www.facebook.com", "fb.watch"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/watch/", "/share/v/", "/videos/"], "query_requirements": {} }
      ]
    },
    {
      "id": "x_twitter_status",
      "family": "social",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 80,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["x.com", "www.x.com", "twitter.com", "www.twitter.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/*/status/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "loom",
      "family": "video",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["loom.com", "www.loom.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/share/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "wistia",
      "family": "video",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["wistia.com", "wistia.net", "fast.wistia.net"], "allow_subdomains": true, "path_match_type": "prefix", "path_patterns": ["/medias/", "/embed/"], "query_requirements": {} }
      ]
    },
    {
      "id": "spotify",
      "family": "audio",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["open.spotify.com"], "allow_subdomains": false, "path_match_type": "segment_template", "path_patterns": ["/track/*", "/album/*", "/playlist/*", "/episode/*", "/show/*"], "query_requirements": {} }
      ]
    },
    {
      "id": "soundcloud",
      "family": "audio",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["soundcloud.com", "www.soundcloud.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/"], "query_requirements": {} }
      ]
    },
    {
      "id": "apple_music",
      "family": "audio",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["music.apple.com", "podcasts.apple.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/"], "query_requirements": {} }
      ]
    },
    {
      "id": "mixcloud",
      "family": "audio",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["mixcloud.com", "www.mixcloud.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/"], "query_requirements": {} }
      ]
    },
    {
      "id": "bandcamp",
      "family": "audio",
      "status": "recognized_but_disabled",
      "fallback_behavior": "treat_as_plain_link",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["bandcamp.com"], "allow_subdomains": true, "path_match_type": "prefix", "path_patterns": ["/"], "query_requirements": {} }
      ]
    },
    {
      "id": "pornhub",
      "family": "adult",
      "status": "recognized_but_disabled",
      "fallback_behavior": "render_no_media",
      "priority": 70,
      "render_kind": "iframe",
      "allow_title_outbound_link": true,
      "embed_builder_key": "",
      "match_rules": [
        { "hosts": ["pornhub.com", "www.pornhub.com"], "allow_subdomains": false, "path_match_type": "prefix", "path_patterns": ["/view_video.php", "/embed/"], "query_requirements": {} }
      ]
    }
  ]
}
```

```js
// scripts/sync-platform-providers.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'shared/providers/platform-external-media.json');
const frontendTarget = path.join(root, 'frontend/src/generated/platformExternalProviders.json');
const backendTarget = path.join(
  root,
  'backend/internal/services/externalproviders/platform_external_media.generated.json'
);

const validStatuses = new Set(['supported_embed', 'supported_preview_only', 'recognized_but_disabled']);
const validFallbacks = new Set(['none', 'treat_as_plain_link', 'render_no_media', 'provider_preview_only']);
const validRenderKinds = new Set(['iframe', 'direct_video', 'direct_image', 'link_preview_only']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateProvider(provider) {
  assert(validStatuses.has(provider.status), `invalid status for ${provider.id}`);
  assert(validFallbacks.has(provider.fallback_behavior), `invalid fallback for ${provider.id}`);
  assert(validRenderKinds.has(provider.render_kind), `invalid render kind for ${provider.id}`);
  if (provider.status === 'supported_embed') {
    assert(provider.fallback_behavior === 'none', `${provider.id} supported_embed requires fallback none`);
    assert(provider.embed_builder_key, `${provider.id} supported_embed requires embed_builder_key`);
  }
  if (provider.status === 'supported_preview_only') {
    assert(provider.render_kind === 'link_preview_only', `${provider.id} preview-only requires link_preview_only render`);
    assert(!provider.embed_builder_key, `${provider.id} preview-only must not define embed_builder_key`);
  }
  if (provider.status === 'recognized_but_disabled') {
    assert(provider.fallback_behavior !== 'none', `${provider.id} disabled provider must define fallback`);
  }
}

const raw = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
raw.providers.forEach(validateProvider);

await fs.mkdir(path.dirname(frontendTarget), { recursive: true });
await fs.mkdir(path.dirname(backendTarget), { recursive: true });
const payload = JSON.stringify(raw, null, 2) + '\n';
await fs.writeFile(frontendTarget, payload, 'utf8');
await fs.writeFile(backendTarget, payload, 'utf8');
console.log(`synced ${raw.providers.length} providers`);
```

- [ ] **Step 4: Run the sync script and targeted tests**

Run:

```bash
node scripts/sync-platform-providers.mjs
cd frontend && npm test -- src/utils/__tests__/platformExternalProviders.test.ts
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services/externalproviders -count=1
```

Expected:
- sync prints `synced 22 providers`
- tests still fail because the classifier implementations are not written yet, not because generated files are missing

- [ ] **Step 5: Commit**

```bash
git add shared/providers/platform-external-media.json scripts/sync-platform-providers.mjs frontend/src/generated/platformExternalProviders.json backend/internal/services/externalproviders/platform_external_media.generated.json frontend/src/utils/__tests__/platformExternalProviders.test.ts backend/internal/services/externalproviders/classifier_test.go
git commit -m "feat: add platform provider catalog and sync tooling"
```

### Task 2: Frontend Provider Classifier And Embed Adapter

**Files:**
- Create: `frontend/src/utils/platformExternalProviders.ts`
- Create: `frontend/src/utils/platformExternalEmbeds.ts`
- Modify: `frontend/src/utils/__tests__/platformExternalProviders.test.ts`
- Test: `frontend/src/components/common/PlatformPostCard.test.tsx`
- Test: `frontend/src/components/posts/PostDetailMedia.test.tsx`

- [ ] **Step 1: Expand the failing frontend tests for classification and parity**

```ts
// append to frontend/src/utils/__tests__/platformExternalProviders.test.ts
it('normalizes x.com and twitter.com to one provider id', () => {
  expect(classifyPlatformExternalUrl('https://x.com/nasa/status/1')?.id).toBe('x_twitter_status');
  expect(classifyPlatformExternalUrl('https://twitter.com/nasa/status/1')?.id).toBe('x_twitter_status');
});

it('returns null for plain article links', () => {
  expect(classifyPlatformExternalUrl('https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html')).toBeNull();
});
```

- [ ] **Step 2: Run the frontend test to verify it fails**

Run:

```bash
cd frontend && npm test -- src/utils/__tests__/platformExternalProviders.test.ts
```

Expected:
- FAIL with missing `classifyPlatformExternalUrl`

- [ ] **Step 3: Implement the classifier and embed builder helpers**

```ts
// frontend/src/utils/platformExternalProviders.ts
import providerCatalog from '../generated/platformExternalProviders.json';

export type PlatformProviderStatus = 'supported_embed' | 'supported_preview_only' | 'recognized_but_disabled';
export type PlatformFallbackBehavior = 'none' | 'treat_as_plain_link' | 'render_no_media' | 'provider_preview_only';

export type PlatformExternalProviderMatch = {
  id: string;
  family: string;
  status: PlatformProviderStatus;
  fallbackBehavior: PlatformFallbackBehavior;
  renderKind: 'iframe' | 'direct_video' | 'direct_image' | 'link_preview_only';
  embedBuilderKey: string;
};

export function classifyPlatformExternalUrl(url?: string | null): PlatformExternalProviderMatch | null {
  if (!url) return null;
  let normalized: URL;
  try {
    normalized = new URL(url.trim());
  } catch {
    return null;
  }
  const host = normalized.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = normalized.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';

  for (const provider of providerCatalog.providers) {
    for (const rule of provider.match_rules) {
      const hosts = rule.hosts.map((value: string) => value.replace(/^www\./, ''));
      if (!hosts.includes(host)) continue;
      const matched = rule.path_patterns.some((pattern: string) => {
        if (rule.path_match_type === 'prefix') return pathname.startsWith(pattern.replace(/\/$/, ''));
        if (rule.path_match_type === 'exact') return pathname === pattern;
        const expected = pattern.split('/').filter(Boolean);
        const actual = pathname.split('/').filter(Boolean);
        if (expected.length !== actual.length && !expected.includes('**')) return false;
        return expected.every((segment: string, index: number) => segment === '*' || segment === '**' || segment === actual[index]);
      });
      if (!matched) continue;
      return {
        id: provider.id,
        family: provider.family,
        status: provider.status,
        fallbackBehavior: provider.fallback_behavior,
        renderKind: provider.render_kind,
        embedBuilderKey: provider.embed_builder_key,
      };
    }
  }
  return null;
}
```

```ts
// frontend/src/utils/platformExternalEmbeds.ts
import { classifyPlatformExternalUrl } from './platformExternalProviders';

export type ExternalEmbed = { kind: 'iframe'; src: string } | { kind: 'video'; src: string };

function getYouTubeEmbed(url: string): string | null {
  const match =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (!match?.[1]) return null;
  const start = new URL(url).searchParams.get('t');
  return `https://www.youtube-nocookie.com/embed/${match[1]}${start ? `?start=${parseInt(start, 10)}` : ''}`;
}

export function getPlatformExternalEmbed(url?: string | null): ExternalEmbed | null {
  const provider = classifyPlatformExternalUrl(url);
  if (!provider || provider.status !== 'supported_embed') return null;
  switch (provider.embedBuilderKey) {
    case 'youtube':
      return getYouTubeEmbed(url!) ? { kind: 'iframe', src: getYouTubeEmbed(url!)! } : null;
    case 'imgur_gifv':
      return { kind: 'video', src: url!.replace(/\.(gifv|gif)$/i, '.mp4') };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the frontend classifier test and verify it passes**

Run:

```bash
cd frontend && npm test -- src/utils/__tests__/platformExternalProviders.test.ts
```

Expected:
- PASS with all classifier assertions green

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/platformExternalProviders.ts frontend/src/utils/platformExternalEmbeds.ts frontend/src/utils/__tests__/platformExternalProviders.test.ts
git commit -m "feat: add frontend platform provider classifier"
```

### Task 3: Frontend Platform Post Parity Refactor

**Files:**
- Modify: `frontend/src/components/common/PlatformPostCard.tsx`
- Modify: `frontend/src/components/posts/PostDetailMedia.tsx`
- Modify: `frontend/src/pages/PostDetailPage.tsx`
- Modify: `frontend/src/components/common/PlatformPostCard.test.tsx`
- Modify: `frontend/src/components/posts/PostDetailMedia.test.tsx`
- Modify: `frontend/src/pages/__tests__/PostDetailPage.test.tsx`

- [ ] **Step 1: Write the failing parity tests**

```ts
// frontend/src/components/common/PlatformPostCard.test.tsx
it('renders youtube posts through the shared provider classifier', () => {
  render(<PlatformPostCard post={{ ...basePost, media_url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Video' }} />);
  expect(screen.getByTitle('Video')).toBeInTheDocument();
});

it('does not render disabled provider media blocks', () => {
  render(<PlatformPostCard post={{ ...basePost, media_url: 'https://www.instagram.com/reel/Cx12345/', title: 'Reel' }} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
```

```ts
// frontend/src/components/posts/PostDetailMedia.test.tsx
it('uses the shared provider classifier for supported embeds', () => {
  render(
    <PostDetailMedia
      mediaUrl="https://youtu.be/dQw4w9WgXcQ"
      decodedTitle="Video"
      isVideoMedia={false}
      imageExpanded={false}
      onToggleExpanded={vi.fn()}
    />
  );
  expect(screen.getByTitle('Video')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted frontend tests to verify they fail**

Run:

```bash
cd frontend && npm test -- src/components/common/PlatformPostCard.test.tsx src/components/posts/PostDetailMedia.test.tsx src/pages/__tests__/PostDetailPage.test.tsx
```

Expected:
- FAIL because the components still use duplicated regex helpers

- [ ] **Step 3: Refactor platform post components to use shared helpers**

```ts
// replace duplicated getExternalVideoMedia usage in PlatformPostCard.tsx and PostDetailMedia.tsx
import { classifyPlatformExternalUrl } from '../../utils/platformExternalProviders';
import { getPlatformExternalEmbed } from '../../utils/platformExternalEmbeds';

const provider = classifyPlatformExternalUrl(post.media_url);
const externalMedia = getPlatformExternalEmbed(post.media_url);
const shouldRenderDisabledProviderMedia = provider?.status === 'recognized_but_disabled' && provider.fallbackBehavior !== 'render_no_media';
```

```ts
// PostDetailPage.tsx
const provider = classifyPlatformExternalUrl(mediaUrl);
const isKnownEmbeddableProvider = provider?.status === 'supported_embed';
const isExternalLinkPost = Boolean(
  sanitizedExternalLink &&
  !postData?.gallery_images?.length &&
  !normalizedMediaType.startsWith('image/') &&
  normalizedMediaType !== 'video' &&
  !isKnownEmbeddableProvider
);
```

- [ ] **Step 4: Run the targeted frontend tests and verify they pass**

Run:

```bash
cd frontend && npm test -- src/components/common/PlatformPostCard.test.tsx src/components/posts/PostDetailMedia.test.tsx src/pages/__tests__/PostDetailPage.test.tsx
```

Expected:
- PASS with YouTube behavior unchanged
- PASS with disabled-provider media blocks suppressed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/PlatformPostCard.tsx frontend/src/components/posts/PostDetailMedia.tsx frontend/src/pages/PostDetailPage.tsx frontend/src/components/common/PlatformPostCard.test.tsx frontend/src/components/posts/PostDetailMedia.test.tsx frontend/src/pages/__tests__/PostDetailPage.test.tsx
git commit -m "refactor: use shared provider classifier for platform posts"
```

### Task 4: Backend Provider Classifier And Generated Catalog Loader

**Files:**
- Create: `backend/internal/services/externalproviders/catalog.go`
- Create: `backend/internal/services/externalproviders/classifier.go`
- Modify: `backend/internal/services/externalproviders/classifier_test.go`

- [ ] **Step 1: Expand the failing backend tests**

```go
// backend/internal/services/externalproviders/classifier_test.go
func TestClassify_RecognizedButDisabledProviders(t *testing.T) {
	result, ok := Classify("https://www.instagram.com/reel/Cx12345/")
	require.True(t, ok)
	require.Equal(t, "instagram_reel", result.ID)
	require.Equal(t, StatusRecognizedButDisabled, result.Status)
	require.Equal(t, FallbackRenderNoMedia, result.FallbackBehavior)
}

func TestClassify_PlainArticleReturnsFalse(t *testing.T) {
	_, ok := Classify("https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html")
	require.False(t, ok)
}
```

- [ ] **Step 2: Run the backend classifier test to verify it fails**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services/externalproviders -count=1
```

Expected:
- FAIL with missing `Classify`

- [ ] **Step 3: Implement the generated-catalog loader and classifier**

```go
// backend/internal/services/externalproviders/catalog.go
package externalproviders

import (
	_ "embed"
	"encoding/json"
)

//go:embed platform_external_media.generated.json
var catalogJSON []byte

type ProviderCatalog struct {
	Providers []Provider `json:"providers"`
}

type Provider struct {
	ID               string      `json:"id"`
	Family           string      `json:"family"`
	Status           Status      `json:"status"`
	FallbackBehavior Fallback    `json:"fallback_behavior"`
	Priority         int         `json:"priority"`
	RenderKind       string      `json:"render_kind"`
	AllowTitleLink   bool        `json:"allow_title_outbound_link"`
	EmbedBuilderKey  string      `json:"embed_builder_key"`
	MatchRules       []MatchRule `json:"match_rules"`
}

var catalog ProviderCatalog

func init() {
	if err := json.Unmarshal(catalogJSON, &catalog); err != nil {
		panic(err)
	}
}
```

```go
// backend/internal/services/externalproviders/classifier.go
package externalproviders

import (
	"net/url"
	"strings"
)

type Status string
type Fallback string

const (
	StatusSupportedEmbed        Status = "supported_embed"
	StatusSupportedPreviewOnly  Status = "supported_preview_only"
	StatusRecognizedButDisabled Status = "recognized_but_disabled"
	FallbackNone                Fallback = "none"
	FallbackTreatAsPlainLink    Fallback = "treat_as_plain_link"
	FallbackRenderNoMedia       Fallback = "render_no_media"
)

type Result struct {
	ID               string
	Status           Status
	FallbackBehavior Fallback
	RenderKind       string
	EmbedBuilderKey  string
}

func Classify(raw string) (*Result, bool) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return nil, false
	}
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	path := strings.TrimSuffix(strings.ReplaceAll(parsed.EscapedPath(), "//", "/"), "/")
	if path == "" {
		path = "/"
	}
	for _, provider := range catalog.Providers {
		for _, rule := range provider.MatchRules {
			if !matchesRule(host, path, rule) {
				continue
			}
			return &Result{
				ID:               provider.ID,
				Status:           provider.Status,
				FallbackBehavior: provider.FallbackBehavior,
				RenderKind:       provider.RenderKind,
				EmbedBuilderKey:  provider.EmbedBuilderKey,
			}, true
		}
	}
	return nil, false
}
```

- [ ] **Step 4: Run the backend classifier test and verify it passes**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services/externalproviders -count=1
```

Expected:
- PASS with generated-catalog classification green

- [ ] **Step 5: Commit**

```bash
git add backend/internal/services/externalproviders/catalog.go backend/internal/services/externalproviders/classifier.go backend/internal/services/externalproviders/classifier_test.go backend/internal/services/externalproviders/platform_external_media.generated.json
git commit -m "feat: add backend platform provider classifier"
```

### Task 5: Platform Post Schema And Model Updates For Link Preview Metadata

**Files:**
- Create: `backend/internal/database/migrations/100_platform_post_link_preview_fields.up.sql`
- Create: `backend/internal/database/migrations/100_platform_post_link_preview_fields.down.sql`
- Modify: `backend/internal/models/platform_post.go`
- Modify: `frontend/src/types/posts.ts`
- Modify: `backend/internal/models/platform_post_test.go`

- [ ] **Step 1: Write the failing persistence tests**

```go
// backend/internal/models/platform_post_test.go
func TestPlatformPostRepository_PersistsLinkPreviewFields(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := NewUserRepository(db.Pool)
	user := &User{Username: fmt.Sprintf("preview_%d", time.Now().UnixNano()), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, user))

	repo := NewPlatformPostRepository(db.Pool)
	mediaURL := "https://example.com/article"
	mediaType := "link"
	thumbnailURL := "/uploads/link-preview.jpg"
	siteName := "Example"
	post := &PlatformPost{
		AuthorID:            user.ID,
		Title:               "Link",
		MediaURL:            &mediaURL,
		MediaType:           &mediaType,
		ThumbnailURL:        &thumbnailURL,
		LinkPreviewSiteName: &siteName,
	}
	require.NoError(t, repo.Create(ctx, post))

	got, err := repo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	require.Equal(t, thumbnailURL, *got.ThumbnailURL)
	require.Equal(t, siteName, *got.LinkPreviewSiteName)
}
```

- [ ] **Step 2: Run the backend model test to verify it fails**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/models -run TestPlatformPostRepository_PersistsLinkPreviewFields -count=1
```

Expected:
- FAIL with unknown fields and/or missing columns

- [ ] **Step 3: Add the migration and model fields**

```sql
-- backend/internal/database/migrations/100_platform_post_link_preview_fields.up.sql
ALTER TABLE platform_posts
  ADD COLUMN link_preview_title text,
  ADD COLUMN link_preview_description text,
  ADD COLUMN link_preview_site_name text;
```

```go
// backend/internal/models/platform_post.go
LinkPreviewTitle       *string `json:"link_preview_title,omitempty"`
LinkPreviewDescription *string `json:"link_preview_description,omitempty"`
LinkPreviewSiteName    *string `json:"link_preview_site_name,omitempty"`
```

```ts
// frontend/src/types/posts.ts
link_preview_title?: string | null;
link_preview_description?: string | null;
link_preview_site_name?: string | null;
```

- [ ] **Step 4: Run the migration/model test and verify it passes**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/models -run TestPlatformPostRepository_PersistsLinkPreviewFields -count=1
```

Expected:
- PASS with the new preview metadata columns round-tripping

- [ ] **Step 5: Commit**

```bash
git add backend/internal/database/migrations/100_platform_post_link_preview_fields.up.sql backend/internal/database/migrations/100_platform_post_link_preview_fields.down.sql backend/internal/models/platform_post.go backend/internal/models/platform_post_test.go frontend/src/types/posts.ts
git commit -m "feat: add platform post link preview metadata fields"
```

### Task 6: Backend Link Preview Service

**Files:**
- Create: `backend/internal/services/linkpreview/service.go`
- Create: `backend/internal/services/linkpreview/service_test.go`
- Create: `backend/internal/services/linkpreview/http_client.go`
- Create: `backend/internal/services/linkpreview/parser.go`
- Create: `backend/internal/services/linkpreview/asset_ingest.go`

- [ ] **Step 1: Write the failing link-preview service tests**

```go
// backend/internal/services/linkpreview/service_test.go
func TestExtractPreview_PrefersOpenGraphImage(t *testing.T) {
	html := `<html><head><meta property="og:image" content="https://cdn.example.com/og.jpg"><meta property="og:title" content="OG Title"></head><body><img src="https://cdn.example.com/body.jpg"></body></html>`
	service := NewService(nil, nil, nil)
	meta, err := service.parseHTML("https://example.com/post", strings.NewReader(html))
	require.NoError(t, err)
	require.Equal(t, "https://cdn.example.com/og.jpg", meta.ImageURL)
	require.Equal(t, "OG Title", meta.Title)
}

func TestExtractPreview_ReturnsEmptyWhenNoUsableImageExists(t *testing.T) {
	html := `<html><body><img src="/pixel.gif" width="1" height="1"></body></html>`
	service := NewService(nil, nil, nil)
	meta, err := service.parseHTML("https://example.com/post", strings.NewReader(html))
	require.NoError(t, err)
	require.Empty(t, meta.ImageURL)
}
```

- [ ] **Step 2: Run the service tests to verify they fail**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services/linkpreview -count=1
```

Expected:
- FAIL with missing `NewService` / `parseHTML`

- [ ] **Step 3: Implement the parser, fetcher, and asset-ingest service**

```go
// backend/internal/services/linkpreview/service.go
type Metadata struct {
	Title       string
	Description string
	SiteName    string
	ImageURL    string
}

type Service struct {
	storage   services.StorageService
	thumbs    *services.ThumbnailService
	httpDo    func(*http.Request) (*http.Response, error)
}

func NewService(storage services.StorageService, thumbs *services.ThumbnailService, client *http.Client) *Service {
	return &Service{
		storage: storage,
		thumbs:  thumbs,
		httpDo:  client.Do,
	}
}
```

```go
// backend/internal/services/linkpreview/parser.go
func (s *Service) parseHTML(pageURL string, body io.Reader) (*Metadata, error) {
	doc, err := goquery.NewDocumentFromReader(body)
	if err != nil {
		return nil, err
	}
	meta := &Metadata{
		Title:       strings.TrimSpace(doc.Find(`meta[property="og:title"]`).AttrOr("content", "")),
		Description: strings.TrimSpace(doc.Find(`meta[property="og:description"]`).AttrOr("content", "")),
		SiteName:    strings.TrimSpace(doc.Find(`meta[property="og:site_name"]`).AttrOr("content", "")),
		ImageURL:    strings.TrimSpace(doc.Find(`meta[property="og:image"]`).AttrOr("content", "")),
	}
	if meta.ImageURL == "" {
		meta.ImageURL = strings.TrimSpace(doc.Find(`meta[name="twitter:image"]`).AttrOr("content", ""))
	}
	return meta, nil
}
```

- [ ] **Step 4: Run the service tests and verify they pass**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services/linkpreview -count=1
```

Expected:
- PASS with metadata extraction green

- [ ] **Step 5: Commit**

```bash
git add backend/internal/services/linkpreview/service.go backend/internal/services/linkpreview/service_test.go backend/internal/services/linkpreview/http_client.go backend/internal/services/linkpreview/parser.go backend/internal/services/linkpreview/asset_ingest.go
git commit -m "feat: add link preview extraction service"
```

### Task 7: Integrate Backend Classification And Link Preview Into Post Create/Update

**Files:**
- Modify: `backend/internal/handlers/posts.go`
- Modify: `backend/internal/handlers/posts_createpost_test.go`
- Modify: `backend/internal/models/platform_post.go`

- [ ] **Step 1: Write the failing handler tests for create/update integration**

```go
// backend/internal/handlers/posts_createpost_test.go
func TestCreatePost_PlainLinkPostStoresLinkMediaType(t *testing.T) {
	handler, hubRepo, postRepo, cleanup := setupPostsCreateTest(t)
	defer cleanup()
	ctx := context.Background()
	hub := &models.Hub{Name: "linkhub", ContentOptions: "any", CreatedBy: ptrInt(1)}
	require.NoError(t, hubRepo.Create(ctx, hub))
	fetchedHub, _ := hubRepo.GetByName(ctx, "linkhub")

	payload := map[string]any{
		"title": "Article",
		"media_url": "https://example.com/article",
		"hub_id": fetchedHub.ID,
		"post_type": "link",
	}

	// ... perform request ...
	posts, err := postRepo.GetByHub(ctx, fetchedHub.ID, "new", 10, 0)
	require.NoError(t, err)
	require.Equal(t, "link", *posts[0].MediaType)
}
```

- [ ] **Step 2: Run the handler test to verify it fails**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/handlers -run TestCreatePost_PlainLinkPostStoresLinkMediaType -count=1
```

Expected:
- FAIL because `CreatePost` still persists request fields directly

- [ ] **Step 3: Implement post normalization and best-effort preview enrichment**

```go
// backend/internal/handlers/posts.go
type PostsHandler struct {
	pool               *pgxpool.Pool
	postRepo           ports.PlatformPostRepository
	// ...
	linkPreviewService *linkpreview.Service
}

func (h *PostsHandler) normalizePostMedia(req *CreatePostRequest) (*string, *string, *string, *string, *string, *string) {
	if req.MediaURL == nil || strings.TrimSpace(*req.MediaURL) == "" {
		return nil, nil, nil, nil, nil, nil
	}
	if provider, ok := externalproviders.Classify(*req.MediaURL); ok {
		if provider.Status == externalproviders.StatusSupportedEmbed {
			return req.MediaURL, req.MediaType, req.ThumbnailURL, nil, nil, nil
		}
	}
	mediaType := ptrString("link")
	return req.MediaURL, mediaType, req.ThumbnailURL, nil, nil, nil
}
```

- [ ] **Step 4: Run the handler tests and verify they pass**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/handlers -run 'TestCreatePost_PlainLinkPostStoresLinkMediaType|TestCreatePost_ToHub_Success' -count=1
```

Expected:
- PASS with plain article links normalized to `media_type = link`
- PASS with existing text post behavior unchanged

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/posts.go backend/internal/handlers/posts_createpost_test.go backend/internal/models/platform_post.go
git commit -m "feat: normalize platform post media using provider registry"
```

### Task 8: Frontend Stored Preview Rendering And Broken-Image Suppression

**Files:**
- Modify: `frontend/src/components/common/PlatformPostCard.tsx`
- Modify: `frontend/src/components/posts/PostDetailMedia.tsx`
- Modify: `frontend/src/pages/PostDetailPage.tsx`
- Modify: `frontend/src/components/common/PlatformPostCard.test.tsx`
- Modify: `frontend/src/components/posts/PostDetailMedia.test.tsx`

- [ ] **Step 1: Add the failing preview-rendering tests**

```ts
// frontend/src/components/common/PlatformPostCard.test.tsx
it('renders a stored link preview thumbnail for plain article posts', () => {
  render(<PlatformPostCard post={{ ...basePost, media_url: 'https://example.com/article', media_type: 'link', thumbnail_url: '/uploads/link-preview.jpg' }} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', 'http://localhost:8080/uploads/link-preview.jpg');
});

it('hides the preview image after load error', async () => {
  render(<PlatformPostCard post={{ ...basePost, media_url: 'https://example.com/article', media_type: 'link', thumbnail_url: '/uploads/missing.jpg' }} />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted preview tests to verify they fail**

Run:

```bash
cd frontend && npm test -- src/components/common/PlatformPostCard.test.tsx src/components/posts/PostDetailMedia.test.tsx
```

Expected:
- FAIL because previews do not yet track `onError` per post instance

- [ ] **Step 3: Implement stored-preview rendering with per-instance hide-on-error state**

```ts
// PlatformPostCard.tsx
const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
const previewImageSrc =
  post.media_type === 'link' && !previewLoadFailed && post.thumbnail_url ? resolveMediaUrl(post.thumbnail_url) : null;

<img
  src={previewImageSrc ?? ''}
  alt={t('posts.media.previewImageAlt', { title: post.title })}
  onError={() => setPreviewLoadFailed(true)}
/>;
```

```ts
// PostDetailMedia.tsx
const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
const displayImage = previewLoadFailed ? null : resolvedThumbnailUrl;
```

- [ ] **Step 4: Run the targeted preview tests and verify they pass**

Run:

```bash
cd frontend && npm test -- src/components/common/PlatformPostCard.test.tsx src/components/posts/PostDetailMedia.test.tsx src/pages/__tests__/PostDetailPage.test.tsx
```

Expected:
- PASS with stored previews rendered for plain article links
- PASS with broken-image icons suppressed after `error` events

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/PlatformPostCard.tsx frontend/src/components/posts/PostDetailMedia.tsx frontend/src/pages/PostDetailPage.tsx frontend/src/components/common/PlatformPostCard.test.tsx frontend/src/components/posts/PostDetailMedia.test.tsx frontend/src/pages/__tests__/PostDetailPage.test.tsx
git commit -m "feat: render stored link previews without broken media"
```

### Task 9: Full Verification

**Files:**
- Modify: none
- Test: `frontend/src/utils/__tests__/platformExternalProviders.test.ts`
- Test: `frontend/src/components/common/PlatformPostCard.test.tsx`
- Test: `frontend/src/components/posts/PostDetailMedia.test.tsx`
- Test: `frontend/src/pages/__tests__/PostDetailPage.test.tsx`
- Test: `backend/internal/services/externalproviders/classifier_test.go`
- Test: `backend/internal/services/linkpreview/service_test.go`
- Test: `backend/internal/handlers/posts_createpost_test.go`
- Test: `backend/internal/models/platform_post_test.go`

- [ ] **Step 1: Run the frontend verification suite**

Run:

```bash
cd frontend && npm test -- src/utils/__tests__/platformExternalProviders.test.ts src/components/common/PlatformPostCard.test.tsx src/components/posts/PostDetailMedia.test.tsx src/pages/__tests__/PostDetailPage.test.tsx
```

Expected:
- PASS for all targeted provider and preview tests

- [ ] **Step 2: Run the backend verification suite**

Run:

```bash
cd backend && GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/services/externalproviders ./internal/services/linkpreview ./internal/models ./internal/handlers -run 'TestClassifier|TestExtractPreview|TestPlatformPostRepository_PersistsLinkPreviewFields|TestCreatePost_' -count=1
```

Expected:
- PASS for classifier, preview service, model persistence, and handler integration tests

- [ ] **Step 3: Run formatter/linting checks needed by touched files**

Run:

```bash
cd frontend && npm run i18n:verify
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend && go test ./internal/services/externalproviders ./internal/services/linkpreview -count=1
```

Expected:
- frontend i18n checks pass
- backend package tests remain green

- [ ] **Step 4: Inspect the final diff for scope discipline**

Run:

```bash
git diff --stat
git diff -- shared/providers/platform-external-media.json scripts/sync-platform-providers.mjs frontend/src/generated/platformExternalProviders.json frontend/src/utils/platformExternalProviders.ts frontend/src/utils/platformExternalEmbeds.ts frontend/src/components/common/PlatformPostCard.tsx frontend/src/components/posts/PostDetailMedia.tsx frontend/src/pages/PostDetailPage.tsx frontend/src/types/posts.ts backend/internal/services/externalproviders backend/internal/services/linkpreview backend/internal/handlers/posts.go backend/internal/models/platform_post.go backend/internal/database/migrations/100_platform_post_link_preview_fields.up.sql
```

Expected:
- only provider-registry, preview service, model/migration, and rendering files are changed

- [ ] **Step 5: Commit**

```bash
git add shared/providers/platform-external-media.json scripts/sync-platform-providers.mjs frontend/src/generated/platformExternalProviders.json frontend/src/utils/platformExternalProviders.ts frontend/src/utils/platformExternalEmbeds.ts frontend/src/components/common/PlatformPostCard.tsx frontend/src/components/posts/PostDetailMedia.tsx frontend/src/pages/PostDetailPage.tsx frontend/src/types/posts.ts backend/internal/services/externalproviders backend/internal/services/linkpreview backend/internal/handlers/posts.go backend/internal/models/platform_post.go backend/internal/database/migrations/100_platform_post_link_preview_fields.up.sql backend/internal/database/migrations/100_platform_post_link_preview_fields.down.sql frontend/src/utils/__tests__/platformExternalProviders.test.ts frontend/src/components/common/PlatformPostCard.test.tsx frontend/src/components/posts/PostDetailMedia.test.tsx frontend/src/pages/__tests__/PostDetailPage.test.tsx backend/internal/services/externalproviders/classifier_test.go backend/internal/services/linkpreview/service_test.go backend/internal/models/platform_post_test.go backend/internal/handlers/posts_createpost_test.go
git commit -m "feat: add platform provider registry and link previews"
```
