import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOmniChatCheckoutIdempotencyId,
  isSafeOmniChatCheckoutURL,
  omnichatService,
} from '../omnichatService';
import { api } from '../../lib/api';

function createHangingFetchMock() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('Expected a request signal'));
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
}

describe('omnichatService media content loading', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts a chat send that never returns after the reply deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = createHangingFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const request = omnichatService.sendMessage(
      42,
      'Are you still there?',
      '123e4567-e89b-42d3-a456-426614174000'
    );
    const rejection = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });

    await vi.advanceTimersByTimeAsync(40_000);

    await rejection;
    const requestInit = fetchMock.mock.calls[0][1];
    expect(requestInit?.signal?.aborted).toBe(true);
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      content: 'Are you still there?',
      request_id: '123e4567-e89b-42d3-a456-426614174000',
    });
  });

  it('cancels the HTTP send when a completed live reply makes it obsolete', async () => {
    const fetchMock = createHangingFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const request = omnichatService.sendMessage(
      42,
      'Keep going.',
      '123e4567-e89b-42d3-a456-426614174000',
      controller.signal
    );
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort(new DOMException('The reply arrived live', 'AbortError'));

    await rejection;
    const requestInit = fetchMock.mock.calls[0][1];
    expect(requestInit?.signal?.aborted).toBe(true);
  });

  it('does not send a stored authorization token to a cross-origin content URL', async () => {
    localStorage.setItem('auth_token', 'sensitive-token');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      omnichatService.getMediaAssetContent('asset-1', 'https://attacker.example/media')
    ).rejects.toThrow('untrusted origin');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('continues to fetch same-origin media with authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['image'])),
    });
    vi.stubGlobal('fetch', fetchMock);

    await omnichatService.getMediaAssetContent('asset-1', '/api/v1/omnichat/media/asset-1/content');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/omnichat/media/asset-1/content',
      expect.objectContaining({ credentials: 'include' })
    );
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(requestInit.headers).has('Authorization')).toBe(false);
  });
});

describe('omnichatService response feedback', () => {
  it('sends only a categorized report and optional note to the response-feedback endpoint', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(undefined);

    await omnichatService.reportResponseFeedback(42, 99, {
      reason: 'character_mismatch',
      note: 'This did not sound like the character.',
    });

    expect(post).toHaveBeenCalledWith('/omnichat/conversations/42/messages/99/feedback', {
      reason: 'character_mismatch',
      note: 'This did not sound like the character.',
    });
  });
});

describe('omnichatService OmniAI creation', () => {
  it('returns the persona object sent directly by the creation endpoint', async () => {
    const payload = {
      request_id: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Sam',
      temperaments: ['warm'],
      interests: ['games'],
      feeling: 'fond',
      relationship: 'friend',
      appearance: { gender: 'woman', age: 27 },
    };
    const persona = { id: 12, name: 'Sam', slug: 'sam-12' };
    const post = vi.spyOn(api, 'post').mockResolvedValue(persona);

    await expect(omnichatService.createOmniAI(payload)).resolves.toBe(persona);
    expect(post).toHaveBeenCalledWith('/omnichat/omniai', payload);
  });
});

describe('omnichatService billing adapters', () => {
  it('maps the catalog, wallet, usage, and video entitlement response envelopes', async () => {
    const get = vi.spyOn(api, 'get');
    get
      .mockResolvedValueOnce({
        offers: [
          {
            id: 'plus-monthly-v1',
            kind: 'subscription',
            price_cents: 299,
            currency: 'USD',
            plan: 'plus',
            period_days: 30,
          },
        ],
      })
      .mockResolvedValueOnce({
        wallet: {
          user_id: 7,
          purchased_balance: 40,
          subscription_balance: 15,
          updated_at: '2026-07-29T12:00:00Z',
        },
      })
      .mockResolvedValueOnce({
        usage: [
          {
            id: 91,
            entry_type: 'usage',
            usage_kind: 'video',
            purchased_delta: -10,
            subscription_delta: 0,
            created_at: '2026-07-29T12:00:00Z',
          },
        ],
        costs: { voice: 1, image: 4, video: 10 },
        limit: 25,
      })
      .mockResolvedValueOnce({ allowed: false, credit_cost: 10, unit: 'per_session' });

    await expect(omnichatService.getBillingCatalog()).resolves.toEqual([
      expect.objectContaining({ id: 'plus-monthly-v1', price_cents: 299 }),
    ]);
    await expect(omnichatService.getBillingWallet()).resolves.toEqual(
      expect.objectContaining({ purchased_balance: 40, subscription_balance: 15 })
    );
    await expect(omnichatService.getBillingUsage(25)).resolves.toEqual(
      expect.objectContaining({
        usage: [expect.objectContaining({ id: 91, purchased_delta: -10 })],
        costs: { voice: 1, image: 4, video: 10 },
      })
    );
    await expect(omnichatService.getVideoEntitlement()).resolves.toEqual({
      allowed: false,
      credit_cost: 10,
      unit: 'per_session',
    });

    expect(get).toHaveBeenNthCalledWith(1, '/omnichat/billing/catalog');
    expect(get).toHaveBeenNthCalledWith(2, '/omnichat/billing/wallet');
    expect(get).toHaveBeenNthCalledWith(3, '/omnichat/billing/usage?limit=25');
    expect(get).toHaveBeenNthCalledWith(4, '/omnichat/billing/video-entitlement');
  });

  it('sends only the opaque offer ID and a UUID idempotency ID to checkout', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      checkout_url: 'https://checkout.example/session/one',
    });
    const idempotencyId = createOmniChatCheckoutIdempotencyId();

    await expect(
      omnichatService.createBillingCheckout('credits-100-v1', idempotencyId)
    ).resolves.toEqual({ checkout_url: 'https://checkout.example/session/one' });

    expect(idempotencyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(post).toHaveBeenCalledWith('/omnichat/billing/checkout', {
      offer_id: 'credits-100-v1',
      idempotency_id: idempotencyId,
    });
  });

  it('accepts only credential-free HTTPS checkout URLs', () => {
    expect(isSafeOmniChatCheckoutURL('https://checkout.example/session/one')).toBe(true);
    expect(isSafeOmniChatCheckoutURL('http://checkout.example/session/one')).toBe(false);
    expect(isSafeOmniChatCheckoutURL('javascript:alert(1)')).toBe(false);
    expect(isSafeOmniChatCheckoutURL('https://user:secret@checkout.example/session')).toBe(false);
    expect(isSafeOmniChatCheckoutURL('/relative-checkout')).toBe(false);
  });
});
