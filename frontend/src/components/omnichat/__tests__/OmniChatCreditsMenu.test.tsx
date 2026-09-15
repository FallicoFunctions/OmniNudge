import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatCreditsMenu from '../OmniChatCreditsMenu';
import { omnichatService } from '../../../services/omnichatService';

vi.mock('../../../services/omnichatService', () => ({
  omnichatQueryKeys: {
    billingWallet: ['omnichat', 'billing', 'wallet'],
    billingUsage: () => ['omnichat', 'billing', 'usage', 50],
  },
  omnichatService: {
    getBillingWallet: vi.fn(),
    getBillingUsage: vi.fn(),
  },
}));

// The credits screen has its own tests; here it is only what Buy more opens.
vi.mock('../OmniChatCommerceModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Plans and OmniCredits" /> : null,
}));

function renderMenu() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OmniChatCreditsMenu />
    </QueryClientProvider>
  );
}

describe('OmniChatCreditsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(omnichatService.getBillingWallet).mockResolvedValue({
      user_id: 9,
      purchased_balance: 40,
      subscription_balance: 15,
      updated_at: '',
    });
    vi.mocked(omnichatService.getBillingUsage).mockResolvedValue({
      usage: [],
      costs: { chat: 1, voice: 1, image: 4, video: 10, call_minute: 3 },
      limit: 50,
    });
  });

  // Both buckets are money the caller can spend, so the header shows the sum.
  it('shows the whole balance in the header', async () => {
    renderMenu();
    expect(await screen.findByRole('button', { name: '55 OmniCredits' })).toBeInTheDocument();
  });

  // Measured at 360 px: signed in with a five-digit balance, the OmniChat header
  // needed more room than a phone has, before a call took any of it.
  it('keeps its chevron off a phone', async () => {
    renderMenu();
    const button = await screen.findByRole('button', { name: '55 OmniCredits' });
    const chevron = button.querySelector('.lucide-chevron-down')!;
    expect(chevron.classList.contains('hidden')).toBe(true);
    expect(chevron.classList.contains('sm:block')).toBe(true);
  });

  // OmniChat has to work by ear. Until the balance arrives the button says so,
  // rather than reading its visual placeholder aloud.
  it('names the balance as loading until it arrives', () => {
    vi.mocked(omnichatService.getBillingWallet).mockReturnValue(new Promise(() => undefined));
    renderMenu();
    expect(screen.getByRole('button', { name: 'Loading OmniCredits' })).toBeInTheDocument();
  });

  it('lists what things cost, with a call priced by the minute', async () => {
    renderMenu();
    fireEvent.click(await screen.findByRole('button', { name: '55 OmniCredits' }));

    expect(await screen.findByText('3/min')).toBeInTheDocument();
    expect(screen.getByText('Call')).toBeInTheDocument();
    expect(screen.getByText('Spoken message')).toBeInTheDocument();
    expect(screen.getByText('Image generation')).toBeInTheDocument();
    expect(screen.getByText('Video generation')).toBeInTheDocument();
  });

  it('opens the credits screen from Buy more and closes the menu', async () => {
    renderMenu();
    fireEvent.click(await screen.findByRole('button', { name: '55 OmniCredits' }));
    fireEvent.click(await screen.findByRole('button', { name: /buy more/i }));

    expect(screen.getByRole('dialog', { name: 'Plans and OmniCredits' })).toBeInTheDocument();
    expect(screen.queryByText('3/min')).toBeNull();
  });

  it('closes on Escape', async () => {
    renderMenu();
    const toggle = await screen.findByRole('button', { name: '55 OmniCredits' });
    fireEvent.click(toggle);
    expect(await screen.findByText('3/min')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('3/min')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
