import { beforeEach, describe, expect, it, vi } from 'vitest';
import { omnichatService } from '../omnichatService';

describe('omnichatService media content loading', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
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
