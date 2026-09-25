import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketProvider } from '../WebSocketContext';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  forgetGroupKeys: vi.fn(),
  shareMissingGroupHistory: vi.fn(),
}));

vi.mock('../../services/groupKeyCache', () => ({
  forgetGroupKeys: mocks.forgetGroupKeys,
  shareMissingGroupHistory: mocks.shareMissingGroupHistory,
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));

vi.mock('../../lib/api', () => ({
  API_BASE_URL: 'http://localhost:8080/api/v1',
  api: { post: mocks.post },
}));

vi.mock('../../services/friendsService', () => ({
  friendsQueryKeys: {
    requests: ['friends', 'requests'],
    friends: ['friends', 'list'],
  },
}));

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  send() {}
}

describe('WebSocketProvider connection lifecycle', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  it('does not revive the disposed Strict Mode connection after its token request resolves', async () => {
    const tokenResolvers: Array<(value: { ws_token: string }) => void> = [];
    mocks.post.mockImplementation(
      () =>
        new Promise<{ ws_token: string }>((resolve) => {
          tokenResolvers.push(resolve);
        })
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <WebSocketProvider>
            <div>connected app</div>
          </WebSocketProvider>
        </QueryClientProvider>
      </StrictMode>
    );

    await waitFor(() => expect(tokenResolvers).toHaveLength(2));
    act(() => {
      tokenResolvers[0]({ ws_token: 'disposed-effect-token' });
      tokenResolvers[1]({ ws_token: 'active-effect-token' });
    });

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    expect(MockWebSocket.instances[0].url).toContain('active-effect-token');
  });
});

describe('WebSocketProvider read receipts', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  // The conversation list is an infinite query. Read as a plain array, every
  // read receipt threw 'prev.map is not a function' and the count stayed.
  it('clears the unread count in the paged conversation list', async () => {
    mocks.post.mockResolvedValue({ ws_token: 'token' });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = (ids: number[]) => ({
      conversations: ids.map((id) => ({ id, unread_count: 3 })),
      next_cursor: undefined,
    });
    queryClient.setQueryData(['conversations', 'all'], {
      pages: [page([47, 48])],
      pageParams: [undefined],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <div>app</div>
        </WebSocketProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'conversation_read', payload: { conversation_id: 47 } }),
        })
      );
    });

    const list = queryClient.getQueryData<{
      pages: Array<{ conversations: Array<{ id: number; unread_count: number }> }>;
    }>(['conversations', 'all']);
    expect(list?.pages[0].conversations.map((c) => [c.id, c.unread_count])).toEqual([
      [47, 0],
      [48, 3],
    ]);
  });
});

describe('WebSocketProvider group keys', () => {
  beforeEach(() => {
    mocks.post.mockReset().mockResolvedValue({ ws_token: 'token' });
    mocks.forgetGroupKeys.mockReset();
    mocks.shareMissingGroupHistory.mockReset().mockResolvedValue(undefined);
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  async function receive(type: string, payload: object) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['group-participants', 47], []);
    queryClient.setQueryData(['group-invites'], []);
    render(
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <div>app</div>
        </WebSocketProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    act(() => {
      MockWebSocket.instances[0].onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type, payload }) })
      );
    });
    return queryClient;
  }

  // A newcomer read none of the group's past until some older member sent a
  // message. Hearing of the join is when this app passes on what it holds.
  it('passes on older keys, and refreshes the members, when someone joins', async () => {
    const queryClient = await receive('group_member_joined', { conversation_id: 47, user_id: 99 });
    expect(mocks.shareMissingGroupHistory).toHaveBeenCalledWith(47);
    expect(queryClient.getQueryState(['group-participants', 47])?.isInvalidated).toBe(true);
  });

  // The invite counts on the Messages badge; it appeared only after the app
  // next fetched its invites.
  it('reads the invite list again when an invite arrives', async () => {
    const queryClient = await receive('group_invite_received', {
      conversation_id: 47,
      invite_id: 5,
    });
    expect(queryClient.getQueryState(['group-invites'])?.isInvalidated).toBe(true);
  });

  // Without this the newcomer's app kept the old versions recorded as missing,
  // and the old messages stayed locked until the page reloaded.
  it('looks again at the keys when it is given older ones', async () => {
    await receive('group_keys_shared', { conversation_id: 47 });
    expect(mocks.forgetGroupKeys).toHaveBeenCalledWith(47);
  });
});
