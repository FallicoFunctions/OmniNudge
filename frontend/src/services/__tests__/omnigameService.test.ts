import { describe, expect, it, vi, beforeEach } from 'vitest';

const libApiMocks = vi.hoisted(() => ({
  getStoredAuthToken: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  getStoredAuthToken: libApiMocks.getStoredAuthToken,
}));

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

  it('posts the requested launch mode to the OmniGame launch endpoint', async () => {
    libApiMocks.getStoredAuthToken.mockReturnValue('test-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ launch_url: 'http://localhost:4173/omnirave?handoff=test' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await omnigameService.createOmniRaveLaunch('guest');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8091/api/v1/omnigame/launch/omnirave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ mode: 'guest' }),
    });
    expect(result).toEqual({ launch_url: 'http://localhost:4173/omnirave?handoff=test' });
  });

  it('omits the auth header for guest launch when no OmniNudge token exists', async () => {
    libApiMocks.getStoredAuthToken.mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ launch_url: 'http://localhost:4173/omnirave?handoff=test' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await omnigameService.createOmniRaveLaunch('guest');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8091/api/v1/omnigame/launch/omnirave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'guest' }),
    });
  });
});
