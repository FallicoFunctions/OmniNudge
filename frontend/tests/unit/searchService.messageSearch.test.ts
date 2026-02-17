import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api } from '../../src/lib/api';
import { searchMessages } from '../../src/services/searchService';

vi.mock('../../src/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

describe('searchService.searchMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends minimal query params for basic search', async () => {
    vi.mocked(api.get).mockResolvedValue({
      messages: [],
      limit: 25,
      offset: 0,
      query: 'hello',
      total: 0,
    });

    await searchMessages({
      query: ' hello ',
      limit: 25,
      offset: 0,
    });

    expect(api.get).toHaveBeenCalledWith('/search/messages?q=hello&limit=25&offset=0');
  });

  it('serializes sort parameter when provided', async () => {
    vi.mocked(api.get).mockResolvedValue({
      messages: [],
      limit: 25,
      offset: 0,
      query: 'hello',
      sort: 'old',
      total: 0,
    });

    await searchMessages({
      query: 'hello',
      sort: 'old',
      limit: 25,
      offset: 0,
    });

    expect(api.get).toHaveBeenCalledWith('/search/messages?q=hello&sort=old&limit=25&offset=0');
  });

  it('serializes optional filters only when enabled', async () => {
    vi.mocked(api.get).mockResolvedValue({
      messages: [],
      limit: 25,
      offset: 50,
      query: '',
      total: 0,
    });

    await searchMessages({
      limit: 25,
      offset: 50,
      conversationId: 42,
      senderId: 7,
      hasFiles: true,
      hasLinks: true,
      includeArchived: true,
      startDate: '2026-02-01T00:00:00Z',
      endDate: '2026-02-17T23:59:59Z',
    });

    expect(api.get).toHaveBeenCalledWith(
      '/search/messages?limit=25&offset=50&conversation_id=42&sender_id=7&has_files=true&has_links=true&include_archived=true&start_date=2026-02-01T00%3A00%3A00Z&end_date=2026-02-17T23%3A59%3A59Z'
    );
  });
});
