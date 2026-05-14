# AI Hub Designer Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile nested-root AI hub page renderer with a single React tree, preserve interactive slot behavior in both preview and live hub pages, and add validation so generated HTML/CSS cannot break the surrounding app.

**Architecture:** Parse AI HTML into real DOM, strip `<style>` blocks, and replace each required slot node with a stable marker `<div>`. Render the AI layout once with `dangerouslySetInnerHTML`, then turn each marker element itself into the runtime slot container and render slot content into it with React portals from the same parent tree. This preserves exact authored DOM structure without nested React roots or extra wrapper levels. Keep backend validation focused on structural safety and a narrow set of high-signal global CSS bans.

**Tech Stack:** React 19, Vite, Vitest, React Testing Library, TanStack Query, Go, Gin

---

## File Structure

**Frontend files**
- Modify: `frontend/src/components/hubDesign/HubAIDesignRenderer.tsx`
- Modify: `frontend/src/components/hubDesign/HubDesignSlots.tsx`
- Modify: `frontend/src/utils/splitAIDesignHTML.ts`
- Modify: `frontend/src/pages/__tests__/HubPage.test.tsx`
- Create: `frontend/src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx`
- Create: `frontend/src/components/hubDesign/__tests__/HubJoinSlot.test.tsx`
- Create: `frontend/src/utils/__tests__/splitAIDesignHTML.test.ts`

**Backend files**
- Modify: `backend/internal/handlers/hub_ai_designer.go`
- Create: `backend/internal/handlers/hub_ai_designer_test.go`

**Plan-only note**
- No routing changes are required in `frontend/src/pages/HubPage.tsx` or `frontend/src/pages/HubAIDesignerPreviewPage.tsx`; both should continue using `HubAIDesignRenderer`.

### Task 1: Lock In Renderer Behavior With Frontend Tests

**Files:**
- Create: `frontend/src/utils/__tests__/splitAIDesignHTML.test.ts`
- Create: `frontend/src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx`
- Modify: `frontend/src/pages/__tests__/HubPage.test.tsx`

- [ ] **Step 1: Write the failing split utility tests**

Create `frontend/src/utils/__tests__/splitAIDesignHTML.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splitAIDesignHTML } from '../splitAIDesignHTML';

describe('splitAIDesignHTML', () => {
  it('extracts styles and replaces slots with marker divs', () => {
    const html = `
      <style>.hub-custom-page{color:red} #hub-feed .hub-slot-tab{color:blue}</style>
      <div class="hub-custom-page">
        <section class="hero-shell">
          <div id="hub-join" style="padding:12px"></div>
        </section>
        <main>
          <div id="hub-feed" style="--color-background:#111;padding:24px"></div>
        </main>
      </div>
    `;

    const result = splitAIDesignHTML(html);

    expect(result.styleContent).toContain('.hub-custom-page');
    expect(result.hasSlots).toBe(true);
    expect(result.slotsByMarker.size).toBe(2);
    expect(result.htmlWithoutStyles).toContain('data-hub-slot-marker');
    expect(result.htmlWithoutStyles).toContain('hub-slot-marker-hub-join');
    expect(result.htmlWithoutStyles).toContain('hub-slot-marker-hub-feed');
  });

  it('preserves surrounding nesting so slot markers stay in-place', () => {
    const html = `
      <div class="hub-custom-page">
        <section class="hero-shell">
          <div id="hub-join"></div>
        </section>
      </div>
    `;

    const result = splitAIDesignHTML(html);

    expect(result.htmlWithoutStyles).toContain('<section class="hero-shell">');
    expect(result.htmlWithoutStyles).toContain('data-hub-slot-marker="hub-slot-marker-hub-join"');
    expect(result.htmlWithoutStyles).toContain('</section>');
  });

  it('returns no markers when no slots are present', () => {
    const result = splitAIDesignHTML('<div class="hub-custom-page"><p>No slots</p></div>');
    expect(result.hasSlots).toBe(false);
    expect(result.slotsByMarker.size).toBe(0);
    expect(result.htmlWithoutStyles).toContain('<p>No slots</p>');
  });
});
```

- [ ] **Step 2: Run the split utility test to verify it fails**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/utils/__tests__/splitAIDesignHTML.test.ts
```

Expected:
- FAIL because the current utility returns string segments instead of `htmlWithoutStyles` plus marker metadata.

- [ ] **Step 3: Write the failing renderer tests**

Create `frontend/src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HubAIDesignRenderer from '../HubAIDesignRenderer';

const mockCheckHubSubscription = vi.fn();
const mockGetHubPosts = vi.fn();

vi.mock('../../../services/hubsService', () => ({
  hubsService: {
    getHubPosts: (...args: unknown[]) => mockGetHubPosts(...args),
  },
}));

vi.mock('../../../services/subscriptionService', () => ({
  subscriptionService: {
    checkHubSubscription: (...args: unknown[]) => mockCheckHubSubscription(...args),
  },
}));

function renderRenderer(htmlContent: string, user: { id: number } | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HubAIDesignRenderer
        hubName="testHub"
        htmlContent={htmlContent}
        user={user as never}
        isModerator={false}
      />
    </QueryClientProvider>,
  );
}

describe('HubAIDesignRenderer', () => {
  beforeEach(() => {
    mockCheckHubSubscription.mockReset();
    mockGetHubPosts.mockReset();

    mockCheckHubSubscription.mockResolvedValue({ is_subscribed: false });
    mockGetHubPosts.mockResolvedValue({
      posts: [
        {
          id: 11,
          title: 'Rendered through slot',
          author_username: 'alice',
          score: 5,
          comment_count: 2,
          created_at: '2026-05-10T00:00:00Z',
        },
      ],
    });
  });

  it('renders slot components inside the original AI DOM structure', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <section class="hero-shell">
          <h1>Hero copy</h1>
          <div id="hub-join" style="padding:12px"></div>
        </section>
        <main>
          <div id="hub-create"></div>
          <div id="hub-feed" style="--color-background:#111;padding:24px"></div>
        </main>
      </div>
    `);

    const heroSection = container.querySelector('.hero-shell');
    expect(heroSection).not.toBeNull();
    expect(within(heroSection as HTMLElement).getByText('Hero copy')).toBeInTheDocument();

    await waitFor(() => {
      expect(within(heroSection as HTMLElement).getByRole('button', { name: 'Join' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ Create Post/i })).toBeInTheDocument();
      expect(screen.getByText('Rendered through slot')).toBeInTheDocument();
    });
  });

  it('preserves slot inline CSS variables on the rendered feed container', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <div id="hub-feed" style="--color-background:#111;padding:24px"></div>
      </div>
    `);

    await screen.findByRole('tab', { name: 'Hot' });

    const feed = container.querySelector('#hub-feed');
    expect(feed).toHaveAttribute('style');
    expect(feed?.getAttribute('style')).toContain('--color-background:#111');
    expect(feed?.getAttribute('style')).toContain('padding:24px');
  });

  it('keeps the feed interactive after first render', async () => {
    const user = userEvent.setup();

    renderRenderer(`
      <div class="hub-custom-page">
        <div id="hub-feed" style="--color-background:#111;padding:24px"></div>
      </div>
    `);

    await user.click(await screen.findByRole('tab', { name: 'New' }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'New' })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
```

- [ ] **Step 4: Run the renderer tests to verify they fail**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx
```

Expected:
- FAIL because the current renderer uses nested roots instead of portal-mounted slot content.

- [ ] **Step 5: Extend `HubPage` coverage for active AI designs**

Add this to `frontend/src/pages/__tests__/HubPage.test.tsx`:

```tsx
vi.mock('../../services/hubAIDesignerService', () => ({
  hubAIDesignerService: {
    getActiveDesign: vi.fn().mockResolvedValue({
      design: {
        id: 9,
        name: 'Active design',
        prompt: 'dark hero',
        html_content: `
          <div class="hub-custom-page">
            <section class="hero-shell">
              <h1>AI Layout</h1>
              <div id="hub-join"></div>
            </section>
            <div id="hub-create"></div>
            <div id="hub-feed" style="--color-background:#111"></div>
          </div>
        `,
        created_at: '2026-05-10T00:00:00Z',
      },
    }),
  },
}));

it('renders the AI design instead of the default hub layout when an active design exists', async () => {
  const Wrapper = createWrapper();
  render(
    <Wrapper>
      <HubPage />
    </Wrapper>,
  );

  await waitFor(() => {
    expect(screen.getByText('AI Layout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the focused frontend suite**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/utils/__tests__/splitAIDesignHTML.test.ts src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx src/pages/__tests__/HubPage.test.tsx
```

Expected:
- FAIL before implementation.

### Task 2: Refactor `splitAIDesignHTML` To Produce Marker-Based HTML

**Files:**
- Modify: `frontend/src/utils/splitAIDesignHTML.ts`

- [ ] **Step 1: Change the utility contract**

Replace the current return shape with:

```ts
export type SlotId = 'hub-feed' | 'hub-join' | 'hub-create' | 'hub-mod';

export interface DesignSlot {
  id: SlotId;
  style: string;
}

export interface SplitDesignResult {
  htmlWithoutStyles: string;
  styleContent: string;
  hasSlots: boolean;
  slotsByMarker: Map<string, DesignSlot>;
}
```

- [ ] **Step 2: Replace each slot node in-place with a stable marker div**

Implement:

```ts
const SLOT_IDS: SlotId[] = ['hub-feed', 'hub-join', 'hub-create', 'hub-mod'];

export function splitAIDesignHTML(html: string): SplitDesignResult {
  if (!html) {
    return {
      htmlWithoutStyles: '',
      styleContent: '',
      hasSlots: false,
      slotsByMarker: new Map(),
    };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styleContent = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n');
  doc.querySelectorAll('style').forEach((node) => node.remove());

  const slotsByMarker = new Map<string, DesignSlot>();

  SLOT_IDS.forEach((id) => {
    const slot = doc.getElementById(id);
    if (!slot) return;

    const marker = `hub-slot-marker-${id}`;
    slotsByMarker.set(marker, {
      id,
      style: slot.getAttribute('style') ?? '',
    });

    const markerNode = doc.createElement('div');
    markerNode.setAttribute('data-hub-slot-marker', marker);
    slot.replaceWith(markerNode);
  });

  return {
    htmlWithoutStyles: doc.body.innerHTML,
    styleContent,
    hasSlots: slotsByMarker.size > 0,
    slotsByMarker,
  };
}
```

- [ ] **Step 3: Run the split utility test**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/utils/__tests__/splitAIDesignHTML.test.ts
```

Expected:
- PASS

### Task 3: Refactor `HubAIDesignRenderer` To Portal-Based Slot Mounting

**Files:**
- Modify: `frontend/src/components/hubDesign/HubAIDesignRenderer.tsx`

- [ ] **Step 1: Remove nested-root lifecycle code**

Delete:
- `ReactDOM.createRoot` usage
- `rootsRef`
- `liveRef`
- the `useLayoutEffect` root creation block that creates nested roots
- the second effect that re-renders nested roots

Keep:
- one `containerRef`
- query state
- extracted style tag lifecycle

- [ ] **Step 2: Render AI HTML once and discover marker nodes after commit**

Use the split utility:

```tsx
const containerRef = useRef<HTMLDivElement>(null);
const [markerElements, setMarkerElements] = useState<Map<string, HTMLElement>>(new Map());

const { htmlWithoutStyles, styleContent, slotsByMarker } = useMemo(
  () => splitAIDesignHTML(htmlContent),
  [htmlContent],
);

useLayoutEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const next = new Map<string, HTMLElement>();
  container.querySelectorAll<HTMLElement>('[data-hub-slot-marker]').forEach((node) => {
    const marker = node.getAttribute('data-hub-slot-marker');
    if (marker) next.set(marker, node);
  });
  setMarkerElements(next);
}, [htmlWithoutStyles]);
```

- [ ] **Step 3: Turn each marker node into the actual slot container**

Add:

```tsx
useLayoutEffect(() => {
  markerElements.forEach((node, marker) => {
    const slot = slotsByMarker.get(marker);
    if (!slot) return;

    node.id = slot.id;
    if (slot.style) {
      node.setAttribute('style', slot.style);
    } else {
      node.removeAttribute('style');
    }
  });
}, [markerElements, slotsByMarker]);
```

- [ ] **Step 4: Create a slot content renderer helper**

Add:

```tsx
const renderSlotContent = useCallback((slot: DesignSlot) => {
  switch (slot.id) {
    case 'hub-join':
      return (
        <HubJoinSlot
          hubName={hubName}
          isSubscribed={isSubscribed}
          userId={user?.id ?? null}
        />
      );
    case 'hub-create':
      return (
        <HubCreateSlot hubName={hubName} userId={user?.id ?? null} />
      );
    case 'hub-mod':
      return (
        <HubModSlot hubName={hubName} isModerator={isModerator} />
      );
    case 'hub-feed':
      return (
        <>
          <HubFeedControls
            sort={sort}
            onSortChange={setSort}
            searchValue={search}
            onSearchChange={setSearch}
            onSearch={handleSearch}
          />
          <StandalonePostFeed
            posts={filteredPosts}
            loading={postsLoading}
            hubName={hubName}
          />
        </>
      );
  }
}, [filteredPosts, handleSearch, hubName, isModerator, isSubscribed, postsLoading, search, sort, user]);
```

- [ ] **Step 5: Render portals into marker spans from the same React tree**

Return:

```tsx
return (
  <>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: htmlWithoutStyles }} />
    {Array.from(slotsByMarker.entries()).map(([marker, slot]) => {
      const target = markerElements.get(marker);
      if (!target) return null;
      return createPortal(renderSlotContent(slot), target, marker);
    })}
  </>
);
```

This preserves authored DOM structure while avoiding nested roots and extra wrapper elements.

- [ ] **Step 6: Keep the style tag lifecycle**

Preserve the existing `useEffect` that appends `styleContent` to `document.head`, but source it only from `splitAIDesignHTML`.

- [ ] **Step 7: Run the focused frontend suite**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/utils/__tests__/splitAIDesignHTML.test.ts src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx src/pages/__tests__/HubPage.test.tsx
```

Expected:
- PASS

### Task 4: Fix Slot State Drift With A Direct Component Test

**Files:**
- Modify: `frontend/src/components/hubDesign/HubDesignSlots.tsx`
- Create: `frontend/src/components/hubDesign/__tests__/HubJoinSlot.test.tsx`

- [ ] **Step 1: Write a failing direct component test**

Create `frontend/src/components/hubDesign/__tests__/HubJoinSlot.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HubJoinSlot } from '../HubDesignSlots';

describe('HubJoinSlot', () => {
  it('updates its label when isSubscribed prop changes on rerender', () => {
    const view = render(
      <HubJoinSlot hubName="testHub" isSubscribed={false} userId={1} />,
    );

    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();

    view.rerender(
      <HubJoinSlot hubName="testHub" isSubscribed userId={1} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the direct component test to verify it fails**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/components/hubDesign/__tests__/HubJoinSlot.test.tsx
```

Expected:
- FAIL because `HubJoinSlot` currently snapshots `initialSubscribed` only once.

- [ ] **Step 3: Make `HubJoinSlot` react to prop changes**

Modify `frontend/src/components/hubDesign/HubDesignSlots.tsx`:

```tsx
import { useEffect, useState } from 'react';

export function HubJoinSlot({
  hubName,
  isSubscribed: initialSubscribed,
  userId,
}: HubJoinSlotProps) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSubscribed(initialSubscribed);
  }, [initialSubscribed]);

  // existing toggle logic
}
```

- [ ] **Step 4: Re-run the direct component test and the renderer suite**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/components/hubDesign/__tests__/HubJoinSlot.test.tsx src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx
```

Expected:
- PASS

### Task 5: Validate Generated HTML/CSS On The Backend

**Files:**
- Modify: `backend/internal/handlers/hub_ai_designer.go`
- Create: `backend/internal/handlers/hub_ai_designer_test.go`

- [ ] **Step 1: Write failing backend validation tests**

Create `backend/internal/handlers/hub_ai_designer_test.go`:

```go
package handlers

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateAIDesignHTML_AllowsScopedSelectorsAndRequiredSlots(t *testing.T) {
	html := `
		<style>
			.hub-custom-page .hero { color: white; }
			#hub-feed .hub-slot-tab { color: cyan; }
			@media (max-width: 768px) {
				.hub-custom-page .hero { padding: 16px; }
			}
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.NoError(t, err)
}

func TestValidateAIDesignHTML_RejectsNavAndDeadLinks(t *testing.T) {
	html := `
		<div class="hub-custom-page">
			<nav><a href="#">Feed</a></nav>
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "nav")
}

func TestValidateAIDesignHTML_RejectsGlobalBodyAndButtonRules(t *testing.T) {
	html := `
		<style>
			body { overflow: hidden; }
			button { display: none; }
		</style>
		<div class="hub-custom-page">
			<div id="hub-join"></div>
			<div id="hub-create"></div>
			<div id="hub-mod"></div>
			<div id="hub-feed"></div>
		</div>
	`

	err := validateAIDesignHTML(html)
	require.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "global")
}
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend
go test ./internal/handlers -run 'TestValidateAIDesignHTML'
```

Expected:
- FAIL because `validateAIDesignHTML` does not exist yet.

- [ ] **Step 3: Add a shared sanitize-and-validate helper**

In `backend/internal/handlers/hub_ai_designer.go`, add:

```go
func sanitizeAndValidateDesignHTML(raw string) (string, error) {
	clean := sanitizeHTML(extractCodeBlock(raw))
	if len(clean) < 1000 {
		return "", fmt.Errorf("AI returned an incomplete design")
	}
	if err := validateAIDesignHTML(clean); err != nil {
		return "", err
	}
	return clean, nil
}
```

- [ ] **Step 4: Implement structural validation**

Validate:
- `.hub-custom-page` exists
- each required slot exists exactly once
- no `<nav>` elements
- no anchors with `href="#"` or `href=""`

```go
var (
	reNavElement       = regexp.MustCompile(`(?is)<nav\b`)
	reDeadAnchorHash   = regexp.MustCompile(`(?is)<a\b[^>]*href\s*=\s*["']#["']`)
	reDeadAnchorEmpty  = regexp.MustCompile(`(?is)<a\b[^>]*href\s*=\s*["']["']`)
	reHubCustomPage    = regexp.MustCompile(`(?is)class\s*=\s*["'][^"']*\bhub-custom-page\b`)
	reSlotJoin         = regexp.MustCompile(`(?is)id\s*=\s*["']hub-join["']`)
	reSlotCreate       = regexp.MustCompile(`(?is)id\s*=\s*["']hub-create["']`)
	reSlotMod          = regexp.MustCompile(`(?is)id\s*=\s*["']hub-mod["']`)
	reSlotFeed         = regexp.MustCompile(`(?is)id\s*=\s*["']hub-feed["']`)
)

func validateAIDesignHTML(clean string) error {
	if !reHubCustomPage.MatchString(clean) {
		return fmt.Errorf("design must contain a .hub-custom-page root")
	}
	if reNavElement.MatchString(clean) {
		return fmt.Errorf("design may not contain nav elements")
	}
	if reDeadAnchorHash.MatchString(clean) || reDeadAnchorEmpty.MatchString(clean) {
		return fmt.Errorf("design may not contain dead links")
	}
	for _, required := range []*regexp.Regexp{reSlotJoin, reSlotCreate, reSlotMod, reSlotFeed} {
		if len(required.FindAllStringIndex(clean, -1)) != 1 {
			return fmt.Errorf("design must include each slot exactly once")
		}
	}
	return validateDesignCSS(clean)
}
```

- [ ] **Step 5: Implement narrow CSS validation**

Reject only top-level global rules. Do not attempt to fully parse arbitrary CSS.

```go
var (
	reStyleBlock         = regexp.MustCompile(`(?is)<style[^>]*>(.*?)</style>`)
	reTopLevelBodyRule   = regexp.MustCompile(`(?im)(^|})\s*body\s*\{`)
	reTopLevelHtmlRule   = regexp.MustCompile(`(?im)(^|})\s*html\s*\{`)
	reTopLevelButtonRule = regexp.MustCompile(`(?im)(^|})\s*button\s*\{`)
	reTopLevelStarRule   = regexp.MustCompile(`(?im)(^|})\s*\*\s*\{`)
	reTopLevelAnchorRule = regexp.MustCompile(`(?im)(^|})\s*a\s*\{`)
)

func validateDesignCSS(clean string) error {
	matches := reStyleBlock.FindAllStringSubmatch(clean, -1)
	for _, match := range matches {
		css := match[1]
		switch {
		case reTopLevelBodyRule.MatchString(css):
			return fmt.Errorf("global body CSS is not allowed")
		case reTopLevelHtmlRule.MatchString(css):
			return fmt.Errorf("global html CSS is not allowed")
		case reTopLevelButtonRule.MatchString(css):
			return fmt.Errorf("global button CSS is not allowed")
		case reTopLevelStarRule.MatchString(css):
			return fmt.Errorf("global universal CSS is not allowed")
		case reTopLevelAnchorRule.MatchString(css):
			return fmt.Errorf("global anchor CSS is not allowed")
		}
	}
	return nil
}
```

- [ ] **Step 6: Route all write paths through validation**

Use `sanitizeAndValidateDesignHTML(...)` in:
- `Generate`
- `ChatDesign`
- `UpdateDesign`
- `SaveDesignVersion`

For AI generation/refinement endpoints:

```go
clean, err := sanitizeAndValidateDesignHTML(rawHTML)
if err != nil {
	RespondError(c, http.StatusBadGateway, err.Error())
	return
}
```

For manual edit endpoints:

```go
clean, err := sanitizeAndValidateDesignHTML(req.HTMLContent)
if err != nil {
	RespondError(c, http.StatusBadRequest, err.Error())
	return
}
```

- [ ] **Step 7: Re-run the backend tests**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend
go test ./internal/handlers -run 'TestValidateAIDesignHTML'
```

Expected:
- PASS

### Task 6: Final Verification

**Files:**
- No new files

- [ ] **Step 1: Run the full focused frontend test set**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/utils/__tests__/splitAIDesignHTML.test.ts src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx src/components/hubDesign/__tests__/HubJoinSlot.test.tsx src/pages/__tests__/HubPage.test.tsx
```

Expected:
- PASS

- [ ] **Step 2: Run the focused backend validation tests**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend
go test ./internal/handlers -run 'TestValidateAIDesignHTML'
```

Expected:
- PASS

- [ ] **Step 3: Run one broader frontend smoke test**

Run:

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge/frontend
npm run test -- src/pages/__tests__/HubPage.test.tsx
```

Expected:
- PASS

- [ ] **Step 4: Manual QA checklist**

Verify in the app once the dev servers are running:
- Preview page renders AI hero content plus real Join / Create / Feed slots
- Live hub page renders the same design when the design is active
- A slot nested inside a `section`, `aside`, or `main` remains inside that container after rendering
- The feed slot preserves CSS custom properties from the generated inline style
- Clicking sort tabs updates the feed inside the AI layout
- Changing subscription state updates the Join button label
- A generated design containing `<nav>` or `body { ... }` is rejected with a clear error

## Self-Review

**Spec coverage:** The plan covers portal-based slot mounting, DOM-preserving slot replacement, slot interactivity, subscription-state correctness, live-page rendering, and backend validation against fake nav/high-signal global CSS.

**Placeholder scan:** No `TODO` / `TBD` placeholders remain. Each task includes concrete files, code, and commands.

**Type consistency:** The plan uses one `DesignSlot` type plus marker map on the frontend and one `validateAIDesignHTML` helper on the backend across all tasks.
