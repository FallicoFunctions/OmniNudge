import { describe, expect, it, vi } from 'vitest';
import {
  buildUserReport,
  normalizeReportReason,
  reportService,
} from '../../src/services/reportService';
import { api } from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('reportService', () => {
  it('normalizes report reasons with case and spacing', () => {
    expect(normalizeReportReason(' Spam ')).toBe('spam');
    expect(normalizeReportReason('hate speech')).toBe('hate_speech');
    expect(normalizeReportReason('illegal')).toBe('illegal_content');
    expect(normalizeReportReason('')).toBe('other');
  });

  it('rejects unsupported report reasons', () => {
    expect(normalizeReportReason('not-a-real-reason')).toBeNull();
  });

  it('falls back unsupported freeform reasons to other and preserves details text', () => {
    expect(buildUserReport('this is custom', 'more context')).toEqual({
      reason: 'other',
      description: 'this is custom\n\nmore context',
    });
  });

  it('uses canonical reasons without duplicating them in description', () => {
    expect(buildUserReport('spam', 'link farm')).toEqual({
      reason: 'spam',
      description: 'link farm',
    });
  });

  it('submits reports to API with canonical payload keys', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);

    await reportService.createReport({
      targetType: 'user',
      targetId: 42,
      reason: 'harassment',
    });

    expect(api.post).toHaveBeenCalledWith('/reports', {
      target_type: 'user',
      target_id: 42,
      reason: 'harassment',
    });
  });

  it('includes optional description when provided', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);

    await reportService.createReport({
      targetType: 'message',
      targetId: 99,
      reason: 'spam',
      description: '  suspicious scam links  ',
    });

    expect(api.post).toHaveBeenCalledWith('/reports', {
      target_type: 'message',
      target_id: 99,
      reason: 'spam',
      description: 'suspicious scam links',
    });
  });
});
