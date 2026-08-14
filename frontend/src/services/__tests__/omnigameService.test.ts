import { describe, expect, it, vi, beforeEach } from 'vitest';

import { omnigameService } from '../omnigameService';

describe('omnigameService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the OmniGame catalog with the OmniRave entry', () => {
    const catalog = omnigameService.getCatalog();

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      slug: 'omnirave',
      name: 'OmniRave',
      summaryKey: 'games.omnirave.summary',
      heroKey: 'games.omnirave.hero',
      gallery: expect.any(Array),
      highlightKeys: expect.any(Array),
      descriptionKeys: expect.any(Array),
    });
  });

  const launchResponse = () =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ launch_url: 'http://localhost:4173/omnirave?handoff=test' }),
    });

  // Site auth is an httpOnly cookie, so the browser attaches it and there is
  // no token for this service to read. Launch must therefore send credentials;
  // without them an account launch would arrive unauthenticated and be
  // downgraded to a guest session.
  //
  // Credentials alone are not enough, which is the part this originally
  // missed. The server treats a cookie-authenticated POST that fails the
  // CSRF check as anonymous rather than rejecting it, so a launch without
  // the header reaches the handler with no user and is refused as though
  // nobody were signed in.
  it('sends credentials and the CSRF header with an account launch', async () => {
    document.cookie = 'omni_csrf=test-csrf-token';
    const fetchMock = launchResponse();
    vi.stubGlobal('fetch', fetchMock);

    const result = await omnigameService.createOmniRaveLaunch('account');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8091/api/v1/omnigame/launch/omnirave');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe(JSON.stringify({ mode: 'account' }));
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('test-csrf-token');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(result).toEqual({ launch_url: 'http://localhost:4173/omnirave?handoff=test' });
  });

  it('never sends an Authorization header, for either mode', async () => {
    for (const mode of ['guest', 'account'] as const) {
      const fetchMock = launchResponse();
      vi.stubGlobal('fetch', fetchMock);

      await omnigameService.createOmniRaveLaunch(mode);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8091/api/v1/omnigame/launch/omnirave');
      expect(init.credentials).toBe('include');
      expect(init.body).toBe(JSON.stringify({ mode }));
      // Identity for this service comes from the site cookie, never a bearer
      // token: the browser must not carry one to the game API.
      expect(new Headers(init.headers).get('Authorization')).toBeNull();
    }
  });
});
