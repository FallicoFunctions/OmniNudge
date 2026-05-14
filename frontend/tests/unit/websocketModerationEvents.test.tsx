import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebSocketProvider } from '../../src/contexts/WebSocketContext';
import { api } from '../../src/lib/api';

const useAuthMock = vi.fn();

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../src/lib/api', () => ({
  API_BASE_URL: 'http://localhost:8080/api/v1',
  api: {
    post: vi.fn().mockResolvedValue({ ws_token: 'test-ws-token' }),
  },
}));

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor() {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.onopen?.();
    }, 0);
  }

  send() {}

  close() {
    this.onclose?.();
  }
}

describe('WebSocket moderation report events', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    useAuthMock.mockReturnValue({
      user: { id: 42, username: 'moderator', role: 'moderator' },
    });
    vi.mocked(api.post).mockResolvedValue({ ws_token: 'test-ws-token' });
    localStorage.setItem('auth_token', 'test-token');
    // @ts-expect-error test mock assignment
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    localStorage.removeItem('auth_token');
    // @ts-expect-error restore runtime global
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it.each(['moderation_report_created', 'moderation_report_updated'])(
    'invalidates moderation queries on %s',
    async (eventType) => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      render(
        <QueryClientProvider client={queryClient}>
          <WebSocketProvider>
            <div>child</div>
          </WebSocketProvider>
        </QueryClientProvider>
      );

      await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
      const socket = MockWebSocket.instances[0];

      socket.onmessage?.({
        data: JSON.stringify({
          type: eventType,
          payload: { report_id: 123, status: 'open' },
        }),
      } as MessageEvent);

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['modReports'] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adminStats'] });
      });
    }
  );
});
