/**
 * Integration tests for moderation flows.
 * Tests moderation and report services against a mocked api.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/lib/api', () => ({ api: mockApi }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import { moderationService } from '../../src/services/moderationService';
import { reportService } from '../../src/services/reportService';
import { usersService } from '../../src/services/usersService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeReport = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  target_type: 'post' as const,
  target_id: 100,
  reason: 'spam',
  status: 'open' as const,
  priority: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Moderation flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TestReportContent_Success: createReport posts correct payload to /reports', async () => {
    mockApi.post.mockResolvedValueOnce({});

    await reportService.createReport({
      targetType: 'post',
      targetId: 100,
      reason: 'spam',
      description: 'Too many links',
    });

    expect(mockApi.post).toHaveBeenCalledWith('/reports', {
      target_type: 'post',
      target_id: 100,
      reason: 'spam',
      description: 'Too many links',
    });
  });

  it('TestReportContent_NoDescription: createReport omits description when blank', async () => {
    mockApi.post.mockResolvedValueOnce({});

    await reportService.createReport({ targetType: 'user', targetId: 5, reason: 'harassment' });

    expect(mockApi.post).toHaveBeenCalledWith('/reports', {
      target_type: 'user',
      target_id: 5,
      reason: 'harassment',
    });
    // description key must be absent
    const payload = mockApi.post.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('description');
  });

  it('TestModerationQueue_LoadsReports: getReports fetches /mod/reports with correct query params', async () => {
    const mockResponse = { reports: [makeReport()], total: 1, next_cursor: null };
    mockApi.get.mockResolvedValueOnce(mockResponse);

    const result = await moderationService.getReports('open', 'priority', 25, 0);

    expect(mockApi.get).toHaveBeenCalledWith(
      expect.stringContaining('/mod/reports?')
    );
    const url: string = mockApi.get.mock.calls[0][0];
    expect(url).toContain('status=open');
    expect(url).toContain('sort=priority');
    expect(url).toContain('limit=25');
    expect(result.reports).toHaveLength(1);
  });

  it('TestModerationQueue_ApproveReport: updateReportStatus posts approved status', async () => {
    mockApi.post.mockResolvedValueOnce({});

    await moderationService.updateReportStatus(1, 'resolved');

    expect(mockApi.post).toHaveBeenCalledWith('/mod/reports/1/status', { status: 'resolved' });
  });

  it('TestModerationQueue_RejectReport: updateReportStatus posts rejected status', async () => {
    mockApi.post.mockResolvedValueOnce({});

    await moderationService.updateReportStatus(2, 'dismissed');

    expect(mockApi.post).toHaveBeenCalledWith('/mod/reports/2/status', { status: 'dismissed' });
  });

  it('TestBlockUser_CallsCorrectEndpoint: blockUser posts to /users/block/{username}', async () => {
    mockApi.post.mockResolvedValueOnce({});

    await usersService.blockUser('spammer123');

    expect(mockApi.post).toHaveBeenCalledWith(
      '/users/block',
      { username: 'spammer123' }
    );
  });

  it('TestBlockUser_CanBeReverted: unblockUser calls DELETE for the blocked user', async () => {
    mockApi.delete.mockResolvedValueOnce({});

    await usersService.unblockUser('spammer123');

    expect(mockApi.delete).toHaveBeenCalledWith(expect.stringContaining('spammer123'));
  });

  it('TestReportContent_RateLimited: 429 from server propagates as thrown error', async () => {
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { status: 429 }));

    await expect(
      reportService.createReport({ targetType: 'post', targetId: 1, reason: 'spam' })
    ).rejects.toThrow();
  });
});
