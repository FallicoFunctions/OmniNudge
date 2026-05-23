import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HubAIDesignLayout from '../HubAIDesignLayout';

const mockCheckHubSubscription = vi.fn();

vi.mock('../../../services/subscriptionService', () => ({
  subscriptionService: {
    checkHubSubscription: (...args: unknown[]) => mockCheckHubSubscription(...args),
    subscribeToHub: vi.fn(),
    unsubscribeFromHub: vi.fn(),
  },
}));

function renderLayout(htmlContent: string, routeVariant: 'index' | 'post' | 'wiki' = 'post') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HubAIDesignLayout
        hubName="testHub"
        htmlContent={htmlContent}
        user={{ id: 7 } as never}
        isModerator={true}
        routeVariant={routeVariant}
      >
        <div data-testid="route-content">Route content</div>
      </HubAIDesignLayout>
    </QueryClientProvider>,
  );
}

describe('HubAIDesignLayout', () => {
  beforeEach(() => {
    mockCheckHubSubscription.mockReset();
    mockCheckHubSubscription.mockResolvedValue({ is_subscribed: true });
  });

  it('mounts route content into the explicit hub-content slot', async () => {
    const { container } = renderLayout(`
      <div class="hub-custom-page">
        <aside id="hub-join"></aside>
        <section id="hub-content"></section>
      </div>
    `);

    const contentHost = await screen.findByTestId('route-content');
    expect(contentHost).toBeInTheDocument();
    expect(container.querySelector('.hub-custom-page')).toHaveAttribute('data-hub-route', 'post');
    expect(container.querySelector('.hub-custom-page')).toHaveClass('hub-route-post');
  });

  it('falls back to the legacy hub-feed host for non-index routes', async () => {
    const { container } = renderLayout(`
      <div class="hub-custom-page">
        <aside id="hub-join"></aside>
        <section id="hub-feed"></section>
      </div>
    `, 'wiki');

    const feedHost = container.querySelector('#hub-feed');
    expect(feedHost).not.toBeNull();
    expect(await within(feedHost as HTMLElement).findByTestId('route-content')).toBeInTheDocument();
    expect(container.querySelector('.hub-custom-page')).toHaveClass('hub-route-wiki');
  });

  it('renders shared slot actions alongside the route content', async () => {
    const { container } = renderLayout(`
      <div class="hub-custom-page">
        <aside id="hub-join"></aside>
        <div id="hub-create"></div>
        <div id="hub-mod"></div>
        <section id="hub-content"></section>
      </div>
    `);

    const joinHost = container.querySelector('#hub-join');
    expect(await within(joinHost as HTMLElement).findByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ create post/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mod Tools' })).toBeInTheDocument();
  });
});
