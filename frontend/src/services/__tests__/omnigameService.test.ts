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

  // Site auth is an httpOnly cookie, so the browser attaches it and there is
  // no token for this service to read. Launch must therefore send credentials;
  // without them an account launch would arrive unauthenticated and be
  // downgraded to a guest session.
  it('sends credentials with an account launch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ launch_url: 'http://localhost:4173/omnirave?handoff=test' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await omnigameService.createOmniRaveLaunch('account');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8091/api/v1/omnigame/launch/omnirave', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'account' }),
    });
    expect(result).toEqual({ launch_url: 'http://localhost:4173/omnirave?handoff=test' });
  });

  it('never sends an Authorization header, for either mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ launch_url: 'http://localhost:4173/omnirave?handoff=test' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await omnigameService.createOmniRaveLaunch('guest');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8091/api/v1/omnigame/launch/omnirave', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'guest' }),
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});
