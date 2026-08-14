import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OmniChatCommerceModal, { formatOmniChatOfferPrice } from '../OmniChatCommerceModal';
import { omnichatService } from '../../../services/omnichatService';

const { mockCreateCheckoutIdempotencyId } = vi.hoisted(() => ({
  mockCreateCheckoutIdempotencyId: vi.fn(),
}));

vi.mock('../../../services/omnichatService', () => ({
  createOmniChatCheckoutIdempotencyId: () => mockCreateCheckoutIdempotencyId(),
  isSafeOmniChatCheckoutURL: (value: string) => value.startsWith('https://'),
  omnichatQueryKeys: {
    billingCatalog: ['omnichat', 'billing', 'catalog'],
    billingWallet: ['omnichat', 'billing', 'wallet'],
    billingUsage: () => ['omnichat', 'billing', 'usage', 50],
  },
  omnichatService: {
    getBillingCatalog: vi.fn(),
    getBillingWallet: vi.fn(),
    getBillingUsage: vi.fn(),
    createBillingCheckout: vi.fn(),
  },
}));

function renderModal(onNavigate = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OmniChatCommerceModal isOpen onClose={vi.fn()} onNavigate={onNavigate} />
    </QueryClientProvider>
  );
  return onNavigate;
}

describe('OmniChatCommerceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCheckoutIdempotencyId
      .mockReturnValueOnce('123e4567-e89b-42d3-a456-426614174000')
      .mockReturnValueOnce('223e4567-e89b-42d3-a456-426614174000');
    vi.mocked(omnichatService.getBillingWallet).mockResolvedValue({
      user_id: 9,
      purchased_balance: 40,
      subscription_balance: 15,
      updated_at: '2026-07-29T12:00:00Z',
    });
    vi.mocked(omnichatService.getBillingUsage).mockResolvedValue({
      usage: [],
      costs: { voice: 1, image: 4, video: 10 },
      limit: 50,
    });
  });

  it('derives localized offer presentation from server codes and sends only the offer ID', async () => {
    vi.mocked(omnichatService.getBillingCatalog).mockResolvedValue([
      {
        id: 'plus-monthly-v1',
        kind: 'subscription',
        plan: 'plus',
        period_days: 30,
        price_cents: 299,
        currency: 'USD',
      },
      {
        id: 'credits-100-v1',
        kind: 'credits',
        credits: 100,
        price_cents: 499,
        currency: 'USD',
      },
    ]);
    vi.mocked(omnichatService.createBillingCheckout).mockResolvedValue({
      checkout_url: 'https://checkout.example/session/one',
    });
    const onNavigate = renderModal();

    expect(await screen.findByText(/\$2\.99\/month/)).toBeInTheDocument();
    expect(screen.getByText('100 OmniCredits')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /choose plus/i }));

    await waitFor(() =>
      expect(omnichatService.createBillingCheckout).toHaveBeenCalledWith(
        'plus-monthly-v1',
        '123e4567-e89b-42d3-a456-426614174000'
      )
    );
    expect(onNavigate).toHaveBeenCalledWith('https://checkout.example/session/one');
  });

  it('fails closed instead of navigating to a non-HTTPS checkout URL', async () => {
    vi.mocked(omnichatService.getBillingCatalog).mockResolvedValue([
      {
        id: 'credits-100-v1',
        kind: 'credits',
        credits: 100,
        price_cents: 499,
        currency: 'USD',
      },
    ]);
    vi.mocked(omnichatService.createBillingCheckout).mockResolvedValue({
      checkout_url: 'http://checkout.example/session/one',
    });
    const onNavigate = renderModal();

    fireEvent.click(await screen.findByRole('button', { name: /buy 100 omnicredits/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/secure checkout/i);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('reuses one checkout idempotency key when a failed request is retried', async () => {
    vi.mocked(omnichatService.getBillingCatalog).mockResolvedValue([
      {
        id: 'credits-100-v1',
        kind: 'credits',
        credits: 100,
        price_cents: 499,
        currency: 'USD',
      },
    ]);
    vi.mocked(omnichatService.createBillingCheckout)
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        checkout_url: 'https://checkout.example/session/one',
      });
    renderModal();

    fireEvent.click(await screen.findByRole('button', { name: /buy 100 omnicredits/i }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /buy 100 omnicredits/i }));

    await waitFor(() => expect(omnichatService.createBillingCheckout).toHaveBeenCalledTimes(2));
    expect(omnichatService.createBillingCheckout).toHaveBeenNthCalledWith(
      1,
      'credits-100-v1',
      '123e4567-e89b-42d3-a456-426614174000'
    );
    expect(omnichatService.createBillingCheckout).toHaveBeenNthCalledWith(
      2,
      'credits-100-v1',
      '123e4567-e89b-42d3-a456-426614174000'
    );
    expect(mockCreateCheckoutIdempotencyId).toHaveBeenCalledTimes(1);
  });

  it('shows a localized not-configured state for an empty server catalog', async () => {
    vi.mocked(omnichatService.getBillingCatalog).mockResolvedValue([]);
    renderModal();

    expect(await screen.findByText(/purchase options are not configured/i)).toBeInTheDocument();
  });

  it('formats server cents and currency codes with the active locale', () => {
    const offer = {
      id: 'plus-monthly-v1',
      kind: 'subscription' as const,
      plan: 'plus' as const,
      period_days: 30,
      price_cents: 299,
      currency: 'EUR',
    };

    expect(formatOmniChatOfferPrice(offer, 'en-US')).toMatch(/€2\.99/);
    expect(formatOmniChatOfferPrice(offer, 'es-ES')).toMatch(/2,99/);
    expect(formatOmniChatOfferPrice(offer, 'ar')).toMatch(/2\.99.*€/);
  });
});
