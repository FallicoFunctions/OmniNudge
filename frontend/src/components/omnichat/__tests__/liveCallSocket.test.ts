import { describe, expect, it, vi } from 'vitest';
import { liveCallSocketUrl, openLiveCallSocket, type LiveCallSocketEvent } from '../liveCallSocket';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState: number = WebSocket.CONNECTING;
  bufferedAmount = 0;
  binaryType = 'blob';
  sent: unknown[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close(code: number) {
    this.closedWith = code;
    this.readyState = WebSocket.CLOSED;
  }
  open() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }
}

function open(handlers = { onAudio: vi.fn(), onEvent: vi.fn(), onClose: vi.fn() }) {
  let socket: FakeSocket | undefined;
  const pending = openLiveCallSocket('call-1', handlers, {
    fetchToken: async () => 'ws-token',
    base: 'http://localhost:8080/api/v1',
    createSocket: (url) => {
      socket = new FakeSocket(url);
      return socket as unknown as WebSocket;
    },
  });
  return { pending, handlers, socket: () => socket as FakeSocket };
}

describe('liveCallSocketUrl', () => {
  it('builds the call route under the API base with the socket token', () => {
    expect(liveCallSocketUrl('call-1', 'tok', 'http://localhost:8080/api/v1')).toBe(
      'ws://localhost:8080/api/v1/omnichat/calls/call-1/live?token=tok'
    );
  });

  it('uses wss behind https and never keeps a query from the base', () => {
    expect(liveCallSocketUrl('a/b', 't', 'https://api.omninudge.com/api/v1/?x=1')).toBe(
      'wss://api.omninudge.com/api/v1/omnichat/calls/a%2Fb/live?token=t'
    );
  });
});

describe('openLiveCallSocket', () => {
  it('routes her voice and the transcript, and ignores anything else', async () => {
    const { pending, handlers, socket } = open();
    await vi.waitFor(() => expect(socket()).toBeDefined());
    expect(socket().url).toContain('/omnichat/calls/call-1/live?token=ws-token');
    expect(socket().binaryType).toBe('arraybuffer');
    socket().open();
    await pending;

    const audio = new ArrayBuffer(4);
    socket().onmessage?.({ data: audio });
    socket().onmessage?.({ data: '{"type":"said","text":"Hey you."}' });
    socket().onmessage?.({ data: '{"type":"interrupted"}' });
    socket().onmessage?.({ data: '{"type":"heard"}' });
    socket().onmessage?.({ data: '{"type":"delete_everything"}' });
    socket().onmessage?.({ data: 'not json' });

    expect(handlers.onAudio).toHaveBeenCalledWith(audio);
    const events: LiveCallSocketEvent[] = handlers.onEvent.mock.calls.map(([event]) => event);
    expect(events).toEqual([{ type: 'said', text: 'Hey you.' }, { type: 'interrupted' }]);
  });

  it('sends audio only while open and while the network keeps up', async () => {
    const { pending, socket } = open();
    await vi.waitFor(() => expect(socket()).toBeDefined());
    socket().open();
    const call = await pending;

    call.sendAudio(new ArrayBuffer(3200));
    socket().bufferedAmount = 1024 * 1024;
    call.sendAudio(new ArrayBuffer(3200));
    socket().bufferedAmount = 0;
    socket().readyState = WebSocket.CLOSED;
    call.sendAudio(new ArrayBuffer(3200));
    expect(socket().sent.length).toBe(1);
  });

  it('reports the close once it has been open, and closes normally when asked', async () => {
    const { pending, handlers, socket } = open();
    await vi.waitFor(() => expect(socket()).toBeDefined());
    socket().open();
    const call = await pending;
    call.close();
    expect(socket().closedWith).toBe(1000);
    socket().onclose?.({ code: 1011, reason: 'The call dropped', wasClean: true });
    expect(handlers.onClose).toHaveBeenCalledWith({ code: 1011, reason: 'The call dropped', clean: true });
  });

  it('passes a pause and a resume through, and asks to resume only while open', async () => {
    const { pending, handlers, socket } = open();
    await vi.waitFor(() => expect(socket()).toBeDefined());
    socket().open();
    const call = await pending;

    socket().onmessage?.({ data: '{"type":"paused"}' });
    socket().onmessage?.({ data: '{"type":"resumed"}' });
    const events: LiveCallSocketEvent[] = handlers.onEvent.mock.calls.map(([event]) => event);
    expect(events).toEqual([{ type: 'paused' }, { type: 'resumed' }]);

    call.resume();
    expect(socket().sent).toEqual(['{"type":"resume"}']);
    socket().readyState = WebSocket.CLOSED;
    call.resume();
    expect(socket().sent).toHaveLength(1);
  });

  it('rejects when the server refuses the socket', async () => {
    const { pending, handlers, socket } = open();
    await vi.waitFor(() => expect(socket()).toBeDefined());
    socket().onerror?.();
    socket().onclose?.({ code: 1006, reason: '', wasClean: false });
    await expect(pending).rejects.toThrow('The call could not be connected.');
    expect(handlers.onClose).not.toHaveBeenCalled();
  });
});
