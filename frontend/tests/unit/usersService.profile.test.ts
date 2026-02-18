import { describe, expect, it, vi } from 'vitest';
import { usersService } from '../../src/services/usersService';
import { api } from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('usersService profile methods', () => {
  it('calls profile-by-id endpoint with canonical path', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 7,
      username: 'alice',
    });

    await usersService.getProfileById(7);

    expect(api.get).toHaveBeenCalledWith('/users/id/7/profile');
  });

  it('calls get-my-profile endpoint', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 11,
      username: 'me',
    });

    await usersService.getMyProfile();

    expect(api.get).toHaveBeenCalledWith('/users/me/profile');
  });

  it('calls update-my-profile endpoint with payload as-is', async () => {
    vi.mocked(api.put).mockResolvedValue({
      id: 11,
      username: 'me',
      bio: 'Updated bio',
      avatar_url: 'https://example.com/avatar.png',
      status_text: 'Building cool things',
    });

    const payload = {
      bio: 'Updated bio',
      avatar_url: 'https://example.com/avatar.png',
      status_text: 'Building cool things',
    };

    await usersService.updateProfile(payload);

    expect(api.put).toHaveBeenCalledWith('/users/me/profile', payload);
  });
});
