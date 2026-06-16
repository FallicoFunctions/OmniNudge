import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminService } from '../adminService';
import { api } from '../../lib/api';

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('adminService - Ban System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listUsers', () => {
    it('fetches users without filters', async () => {
      const mockResponse = {
        users: [],
        limit: 50,
        offset: 0,
        total: 0,
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await adminService.listUsers();

      expect(api.get).toHaveBeenCalledWith('/admin/users?limit=50&offset=0');
      expect(result).toEqual(mockResponse);
    });

    it('fetches users with status filter', async () => {
      const mockResponse = {
        users: [
          {
            id: 1,
            username: 'banneduser',
            banned: true,
          },
        ],
        limit: 50,
        offset: 0,
        total: 1,
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await adminService.listUsers('', '', 'banned', 50, 0);

      expect(api.get).toHaveBeenCalledWith('/admin/users?status=banned&limit=50&offset=0');
    });

    it('fetches users with search and role filter', async () => {
      await adminService.listUsers('test', 'admin', '', 25, 10);

      expect(api.get).toHaveBeenCalledWith(
        '/admin/users?search=test&role=admin&limit=25&offset=10'
      );
    });
  });

  describe('banUser', () => {
    it('bans user with reason', async () => {
      const mockResponse = { message: 'User banned' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await adminService.banUser(123, 'Spam posting', true);

      expect(api.post).toHaveBeenCalledWith('/admin/users/123/ban', {
        reason: 'Spam posting',
        show_reason: true,
      });
      expect(result).toEqual(mockResponse);
    });

    it('bans user with hidden reason', async () => {
      const mockResponse = { message: 'User banned' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      await adminService.banUser(456, 'Internal reason', false);

      expect(api.post).toHaveBeenCalledWith('/admin/users/456/ban', {
        reason: 'Internal reason',
        show_reason: false,
      });
    });
  });

  describe('shadowBanUser', () => {
    it('shadow bans user with reason', async () => {
      const mockResponse = { message: 'User shadow banned' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await adminService.shadowBanUser(789, 'Suspicious activity', false);

      expect(api.post).toHaveBeenCalledWith('/admin/users/789/shadow-ban', {
        reason: 'Suspicious activity',
        show_reason: false,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('unbanUser', () => {
    it('unbans user with reason', async () => {
      const mockResponse = { message: 'User unbanned' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await adminService.unbanUser(123, 'Appeal approved');

      expect(api.post).toHaveBeenCalledWith('/admin/users/123/unban', {
        reason: 'Appeal approved',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('softDeleteUser', () => {
    it('soft deletes user with reason', async () => {
      const mockResponse = { message: 'User deleted' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await adminService.softDeleteUser(123, 'ToS violation');

      expect(api.post).toHaveBeenCalledWith('/admin/users/123/delete', {
        reason: 'ToS violation',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getBanHistory', () => {
    it('fetches ban history for user', async () => {
      const mockResponse = {
        history: [
          {
            id: 1,
            user_id: 123,
            action: 'ban',
            reason: 'Spam',
            show_reason: true,
            admin_id: 1,
            admin_name: 'admin',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await adminService.getBanHistory(123);

      expect(api.get).toHaveBeenCalledWith('/admin/users/123/ban-history');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getAllBanHistory', () => {
    it('fetches all ban history with default pagination', async () => {
      const mockResponse = {
        history: [],
        limit: 50,
        offset: 0,
        total: 0,
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await adminService.getAllBanHistory();

      expect(api.get).toHaveBeenCalledWith('/admin/ban-history?limit=50&offset=0');
      expect(result).toEqual(mockResponse);
    });

    it('fetches all ban history with custom pagination', async () => {
      const mockResponse = {
        history: [],
        limit: 25,
        offset: 10,
        total: 100,
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await adminService.getAllBanHistory(25, 10);

      expect(api.get).toHaveBeenCalledWith('/admin/ban-history?limit=25&offset=10');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('error handling', () => {
    it('propagates errors from ban operations', async () => {
      const mockError = new Error('Network error');
      vi.mocked(api.post).mockRejectedValue(mockError);

      await expect(adminService.banUser(123, 'Test', true)).rejects.toThrow('Network error');
    });

    it('propagates errors from history fetch', async () => {
      const mockError = new Error('Unauthorized');
      vi.mocked(api.get).mockRejectedValue(mockError);

      await expect(adminService.getBanHistory(123)).rejects.toThrow('Unauthorized');
    });
  });
});
