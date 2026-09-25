import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketProvider } from '../WebSocketContext';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  forgetGroupKeys: vi.fn(),
  shareMissingGroupHistory: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('../../hooks/useToast', () => ({ addToast: mocks.addToast }));

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
    queryClient.setQueryData(['group-settings', 47], {});
    queryClient.setQueryData(['group-invites'], []);
    queryClient.setQueryData(['conversations', 'all'], { pages: [], pageParams: [] });
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

  // A leave, a removal or a ban reached no app, so the member list, and for the
  // one who went the group itself, stayed on screen until a refresh.
  it.each(['group_member_left', 'group_member_banned'])(
    'reads the members and the conversations again on %s',
    async (type) => {
      const queryClient = await receive(type, { conversation_id: 47, user_id: 99 });
      expect(queryClient.getQueryState(['group-participants', 47])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(['conversations', 'all'])?.isInvalidated).toBe(true);
    }
  );

  // 'Anyone can invite' turned on, a rename, a new admin: no other member saw
  // it until a refresh.
  it('reads the settings, members and conversations again when the group changes', async () => {
    const queryClient = await receive('group_updated', { conversation_id: 47 });
    expect(queryClient.getQueryState(['group-settings', 47])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['group-participants', 47])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['conversations', 'all'])?.isInvalidated).toBe(true);
  });

  // The ban reason reached every member's app and was shown to nobody. It is
  // now sent to the banned user alone, and shown to them.
  it('tells the banned user why, and drops the group from their list', async () => {
    mocks.addToast.mockReset();
    const queryClient = await receive('group_you_were_banned', {
      conversation_id: 47,
      group_name: 'Test',
      reason: 'spam',
    });
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: 'You were banned from Test',
        description: 'Reason: spam',
        duration: 0,
      })
    );
    expect(queryClient.getQueryState(['conversations', 'all'])?.isInvalidated).toBe(true);
  });

  it('says only that the user was banned when no reason was given', async () => {
    mocks.addToast.mockReset();
    await receive('group_you_were_banned', { conversation_id: 47, group_name: 'Test', reason: '' });
    expect(mocks.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You were banned from Test', description: undefined })
    );
  });

  // The open group applies admin actions from 'ws-group-event', which nothing
  // sent: a mute, a deleted message or slow mode showed only after a refresh.
  it.each([
    'group_member_muted',
    'group_member_unmuted',
    'group_member_banned',
    'group_message_deleted_by_admin',
    'group_slow_mode_updated',
  ])('passes %s to the open group', async (type) => {
    const seen: Array<{ type: string; payload: unknown }> = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener('ws-group-event', listener);
    try {
      await receive(type, { conversation_id: 47, user_id: 99 });
      expect(seen).toEqual([{ type, payload: { conversation_id: 47, user_id: 99 } }]);
    } finally {
      window.removeEventListener('ws-group-event', listener);
    }
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
