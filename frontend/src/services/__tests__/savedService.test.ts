import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from '../../lib/api';
import { savedService } from '../savedService';

describe('savedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches saved items with browser caching disabled', async () => {
    vi.mocked(api.get).mockResolvedValue({ type: 'posts', saved_posts: [] });

    await savedService.getSavedItems('posts');

    expect(api.get).toHaveBeenCalledWith('/users/me/saved?type=posts', { cache: 'no-store' });
  });

  it('fetches hidden items with browser caching disabled', async () => {
    vi.mocked(api.get).mockResolvedValue({ type: 'posts', hidden_posts: [] });

    await savedService.getHiddenItems('posts');

    expect(api.get).toHaveBeenCalledWith('/users/me/hidden?type=posts', { cache: 'no-store' });
  });
});
