import { describe, expect, it, vi } from 'vitest';
import { moderationService } from '../../src/services/moderationService';
import { api } from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('moderationService report queue methods', () => {
  it('builds mod reports query with status/sort/limit/offset', async () => {
    vi.mocked(api.get).mockResolvedValue({
      reports: [],
      limit: 25,
      offset: 0,
      status: 'open',
      sort: 'priority',
    });

    await moderationService.getReports('open', 'priority', 25, 0);

    expect(api.get).toHaveBeenCalledWith('/mod/reports?status=open&sort=priority&limit=25&offset=0');
  });

  it('includes cursor when provided', async () => {
    vi.mocked(api.get).mockResolvedValue({
      reports: [],
      limit: 25,
      offset: 0,
      status: 'open',
      sort: 'recent',
      next_cursor: 'abc',
    });

    await moderationService.getReports('open', 'recent', 25, 0, 'abc');

    expect(api.get).toHaveBeenCalledWith(
      '/mod/reports?status=open&sort=recent&limit=25&offset=0&cursor=abc'
    );
  });

  it('posts report status updates with canonical payload', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);

    await moderationService.updateReportStatus(123, 'approved');

    expect(api.post).toHaveBeenCalledWith('/mod/reports/123/status', { status: 'approved' });
  });
});
