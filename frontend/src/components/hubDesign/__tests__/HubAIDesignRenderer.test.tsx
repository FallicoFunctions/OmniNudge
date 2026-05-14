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

function renderRenderer(
  htmlContent: string,
  user: { id: number } | null = null,
  isModerator = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HubAIDesignRenderer
        hubName="testHub"
        htmlContent={htmlContent}
        user={user as never}
        isModerator={isModerator}
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
          author_id: 7,
          author_username: 'alice',
          hub_name: 'testHub',
          score: 5,
          comment_count: 2,
          created_at: '2026-05-10T00:00:00Z',
        },
      ],
    });
  });

  it('renders the shared live and preview slot contract inside the original AI DOM structure', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <section class="hero-shell">
          <h1>Hero copy</h1>
          <div id="hub-join" style="padding:12px"></div>
        </section>
        <main>
          <div id="hub-create"></div>
          <div id="hub-mod"></div>
          <div id="hub-feed" style="--color-background:#111;padding:24px"></div>
        </main>
      </div>
    `, { id: 7 }, true);

    const heroSection = container.querySelector('.hero-shell');
    expect(heroSection).not.toBeNull();
    expect(within(heroSection as HTMLElement).getByText('Hero copy')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        within(heroSection as HTMLElement).getByRole('button', { name: 'Join' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ Create Post/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mod Tools' })).toBeInTheDocument();
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

  it('preserves a safe container host and safe layout attributes at runtime', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <aside
          id="hub-join"
          class="join-shell promo-shell"
          data-cta="join-now"
          title="Join shell"
        ></aside>
        <section
          id="hub-feed"
          class="feed-shell fancy-shell"
          data-density="compact"
          title="Designer feed"
          style="--color-background:#111;padding:24px"
        ></section>
      </div>
    `);

    await screen.findByRole('tab', { name: 'Hot' });

    const joinHost = container.querySelector('#hub-join');
    expect(joinHost?.tagName).toBe('ASIDE');
    expect(joinHost).toHaveClass('join-shell', 'promo-shell');
    expect(joinHost).toHaveAttribute('data-cta', 'join-now');
    expect(joinHost).toHaveAttribute('title', 'Join shell');

    const feedHost = container.querySelector('#hub-feed');
    expect(feedHost?.tagName).toBe('SECTION');
    expect(feedHost).toHaveClass('feed-shell', 'fancy-shell');
    expect(feedHost).toHaveAttribute('data-density', 'compact');
    expect(feedHost).toHaveAttribute('title', 'Designer feed');
    expect(feedHost?.getAttribute('style')).toContain('--color-background:#111');
    expect(feedHost?.getAttribute('style')).toContain('padding:24px');
  });

  it('normalizes an unsafe slot host tag to a safe runtime container', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <button id="hub-join" class="join-shell" data-cta="join-now">Placeholder</button>
      </div>
    `);

    await screen.findByRole('button', { name: 'Join' });

    const joinHost = container.querySelector('#hub-join');
    expect(joinHost?.tagName).toBe('DIV');
    expect(joinHost).toHaveClass('join-shell');
    expect(joinHost).toHaveAttribute('data-cta', 'join-now');
    expect(within(joinHost as HTMLElement).getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });

  it('strips harmful host attributes like hidden and aria-hidden at runtime', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <section
          id="hub-feed"
          class="feed-shell"
          data-density="compact"
          hidden
          aria-hidden="true"
          onclick="alert('x')"
        ></section>
      </div>
    `);

    await screen.findByRole('tab', { name: 'Hot' });

    const feedHost = container.querySelector('#hub-feed');
    expect(feedHost?.tagName).toBe('SECTION');
    expect(feedHost).toHaveClass('feed-shell');
    expect(feedHost).toHaveAttribute('data-density', 'compact');
    expect(feedHost).not.toHaveAttribute('hidden');
    expect(feedHost).not.toHaveAttribute('aria-hidden');
    expect(feedHost).not.toHaveAttribute('onclick');
  });

  it('clears pre-authored children from non-empty slot hosts before mounting live UI', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <aside id="hub-join" class="join-shell">
          Placeholder join copy
          <span data-testid="join-placeholder">Join placeholder</span>
        </aside>
        <section id="hub-feed" class="feed-shell">
          <p>Loading fallback posts</p>
          <div data-testid="feed-placeholder">Placeholder feed card</div>
        </section>
      </div>
    `);

    await screen.findByRole('tab', { name: 'Hot' });

    expect(screen.queryByText('Placeholder join copy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('join-placeholder')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading fallback posts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed-placeholder')).not.toBeInTheDocument();

    const joinHost = container.querySelector('#hub-join');
    expect(joinHost?.tagName).toBe('ASIDE');
    expect(within(joinHost as HTMLElement).getByRole('button', { name: 'Join' })).toBeInTheDocument();

    const feedHost = container.querySelector('#hub-feed');
    expect(feedHost?.tagName).toBe('SECTION');
    expect(within(feedHost as HTMLElement).getByRole('tab', { name: 'Hot' })).toBeInTheDocument();
    expect(within(feedHost as HTMLElement).getByPlaceholderText('Search posts…')).toBeInTheDocument();
  });

  it('mounts the feed as one structured subtree with stable styling hooks', async () => {
    const { container } = renderRenderer(`
      <div class="hub-custom-page">
        <section id="hub-feed" class="feed-shell"></section>
      </div>
    `);

    await screen.findByText('Rendered through slot');

    const feedHost = container.querySelector('#hub-feed');
    const feedWrapper = feedHost?.querySelector(':scope > .hub-slot-feed');
    expect(feedWrapper).toBeInTheDocument();
    expect(feedHost?.children).toHaveLength(1);
    expect(feedWrapper?.querySelector('.hub-slot-feed-controls')).toBeInTheDocument();
    expect(feedWrapper?.querySelector('.hub-slot-feed-tabs')).toBeInTheDocument();
    expect(feedWrapper?.querySelector('.hub-slot-feed-search-wrap')).toBeInTheDocument();
    expect(feedWrapper?.querySelector('.hub-slot-search')).toBeInTheDocument();
    expect(feedWrapper?.querySelector('.hub-slot-feed-list')).toBeInTheDocument();
    expect(feedWrapper?.querySelector('.hub-slot-post-card')).toBeInTheDocument();
    expect(feedWrapper?.querySelector('.hub-slot-post-title')).toBeInTheDocument();
    expect(feedWrapper?.querySelector('.hub-slot-post-meta')).toBeInTheDocument();
  });

  it('mounts extracted styles into document head and removes them on unmount', async () => {
    const { unmount } = renderRenderer(`
      <style>.hub-custom-page{color:red}</style>
      <div class="hub-custom-page">
        <div id="hub-feed"></div>
      </div>
    `);

    await screen.findByRole('tab', { name: 'Hot' });

    const styleTag = document.head.querySelector('style[data-hub-ai-design="testHub"]');
    expect(styleTag?.textContent).toContain('.hub-custom-page{color:red}');

    unmount();

    expect(document.head.querySelector('style[data-hub-ai-design="testHub"]')).toBeNull();
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
