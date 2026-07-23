import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorldSocket } from '../worldSocket';
import type { WorldSocketClock, WorldSocketLike } from '../worldSocket';

class FakeWebSocket implements WorldSocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.onclose?.({ code, reason });
  }

  // Test helpers below are not part of WorldSocketLike.
  triggerOpen(): void {
    this.onopen?.();
  }

  triggerServerClose(): void {
    this.onclose?.({ code: 1006, reason: 'lost' });
  }

  triggerMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

function createFakeClock(): WorldSocketClock & {
  advance: (ms: number) => void;
  pendingCount: () => number;
} {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { fireAt: number; callback: () => void }>();

  return {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const handle = nextHandle++;
      timers.set(handle, { fireAt: now + delayMs, callback });
      return handle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle);
    },
    advance: (ms) => {
      now += ms;
      // Fire due timers in scheduled order; a fired timer may itself
      // schedule a new one, so re-check the due set until none remain.
      let fired = true;
      while (fired) {
        fired = false;
        for (const [handle, timer] of [...timers.entries()].sort((a, b) => a[1].fireAt - b[1].fireAt)) {
          if (timer.fireAt <= now && timers.has(handle)) {
            timers.delete(handle);
            timer.callback();
            fired = true;
          }
        }
      }
    },
    pendingCount: () => timers.size,
  };
}

function setup() {
  const clock = createFakeClock();
  let lastSocket: FakeWebSocket | null = null;
  const sockets: FakeWebSocket[] = [];

  const webSocketFactory = vi.fn((url: string) => {
    const socket = new FakeWebSocket(url);
    lastSocket = socket;
    sockets.push(socket);
    return socket;
  });

  const worldSocket = createWorldSocket({
    url: 'wss://example.test/ws',
    token: 'jwt-token',
    webSocketFactory,
    clock,
  });

  return {
    clock,
    worldSocket,
    webSocketFactory,
    sockets,
    getLastSocket: () => lastSocket as FakeWebSocket,
  };
}

describe('createWorldSocket', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('connects to the token-suffixed url and reports status transitions', () => {
    const { worldSocket, webSocketFactory, getLastSocket } = setup();
    const statuses: string[] = [];
    worldSocket.onStatusChange((status) => statuses.push(status));

    worldSocket.connect();
    expect(webSocketFactory).toHaveBeenCalledWith('wss://example.test/ws?token=jwt-token');
    expect(statuses).toEqual(['connecting']);

    getLastSocket().triggerOpen();
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('sends move immediately when outside the throttle window', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    worldSocket.sendMove({ x: 1, y: 0, z: 2 });

    expect(getLastSocket().sent).toEqual([JSON.stringify({ type: 'move', moveTo: { x: 1, y: 0, z: 2 } })]);
    expect(clock.pendingCount()).toBe(0);
  });

  it('throttles rapid moves to one per 100ms and sends the freshest trailing position', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    worldSocket.sendMove({ x: 1, y: 0, z: 0 });
    worldSocket.sendMove({ x: 2, y: 0, z: 0 });
    worldSocket.sendMove({ x: 3, y: 0, z: 0 });

    // Only the first move sent synchronously; the rest are coalesced.
    expect(getLastSocket().sent).toEqual([JSON.stringify({ type: 'move', moveTo: { x: 1, y: 0, z: 0 } })]);

    clock.advance(99);
    expect(getLastSocket().sent).toHaveLength(1);

    clock.advance(1);
    expect(getLastSocket().sent).toEqual([
      JSON.stringify({ type: 'move', moveTo: { x: 1, y: 0, z: 0 } }),
      JSON.stringify({ type: 'move', moveTo: { x: 3, y: 0, z: 0 } }),
    ]);
  });

  it('sends respawn and chat with the exact expected shape', () => {
    const { worldSocket, getLastSocket } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    worldSocket.sendRespawn();
    worldSocket.sendChat('plur forever');

    expect(getLastSocket().sent).toEqual([
      JSON.stringify({ type: 'respawn' }),
      JSON.stringify({ type: 'chat', body: 'plur forever' }),
    ]);
  });

  it('dispatches parsed world_snapshot players to snapshot callbacks', () => {
    const { worldSocket, getLastSocket } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    const received: unknown[] = [];
    worldSocket.onSnapshot((snapshot) => received.push(snapshot));

    getLastSocket().triggerMessage(
      JSON.stringify({
        type: 'world_snapshot',
        players: [
          {
            id: 'p1',
            playerName: 'Raver',
            mode: 'account',
            position: { x: 1, y: 2, z: 3 },
            zone: 'main_stage',
            loadout: { top: 'mesh' },
          },
        ],
        zoneMedia: [{ zoneId: 'main_stage', trackId: 'v1', playlistIndex: 0, playheadSeconds: 12 }],
        zoneEvents: [{ zoneId: 'main_stage', phase: 'active', eventName: 'drop', activeMinute: 2 }],
        currentPlayerId: 'p1',
        activeZone: 'main_stage',
      }),
    );

    expect(received).toEqual([
      {
        players: [
          {
            id: 'p1',
            playerName: 'Raver',
            mode: 'account',
            position: { x: 1, y: 2, z: 3 },
            zone: 'main_stage',
            loadout: { top: 'mesh' },
          },
        ],
        zoneMedia: [{ zoneId: 'main_stage', trackId: 'v1', playlistIndex: 0, playheadSeconds: 12 }],
        zoneEvents: [{ zoneId: 'main_stage', phase: 'active', eventName: 'drop', activeMinute: 2 }],
        currentPlayerId: 'p1',
        activeZone: 'main_stage',
      },
    ]);
  });

  it('dispatches chat_message to chat callbacks', () => {
    const { worldSocket, getLastSocket } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    const received: unknown[] = [];
    worldSocket.onChat((message) => received.push(message));

    getLastSocket().triggerMessage(
      JSON.stringify({
        type: 'chat_message',
        playerId: 'p1',
        playerName: 'Raver',
        body: 'hi',
        createdAt: '2026-07-22T00:00:00Z',
      }),
    );

    expect(received).toEqual([
      { playerId: 'p1', playerName: 'Raver', body: 'hi', createdAt: '2026-07-22T00:00:00Z' },
    ]);
  });

  it('ignores malformed inbound JSON without throwing, warning once per burst', () => {
    const { worldSocket, getLastSocket } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    const snapshotCallback = vi.fn();
    worldSocket.onSnapshot(snapshotCallback);

    expect(() => getLastSocket().triggerMessage('{not json')).not.toThrow();
    expect(() => getLastSocket().triggerMessage('also not json')).not.toThrow();
    expect(() => getLastSocket().triggerMessage(JSON.stringify({ noType: true }))).not.toThrow();

    expect(snapshotCallback).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // A valid message resets the burst so the next malformed one warns again.
    getLastSocket().triggerMessage(JSON.stringify({ type: 'chat_message', playerId: '', playerName: '', body: '', createdAt: '' }));
    getLastSocket().triggerMessage('{still not json');
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('reconnects on unexpected close with capped exponential backoff', () => {
    const { worldSocket, webSocketFactory, getLastSocket, clock } = setup();
    worldSocket.connect();
    expect(webSocketFactory).toHaveBeenCalledTimes(1);

    getLastSocket().triggerOpen();
    getLastSocket().triggerServerClose();

    // First retry after 1s.
    clock.advance(999);
    expect(webSocketFactory).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(webSocketFactory).toHaveBeenCalledTimes(2);

    getLastSocket().triggerServerClose();
    clock.advance(1999);
    expect(webSocketFactory).toHaveBeenCalledTimes(2);
    clock.advance(1);
    expect(webSocketFactory).toHaveBeenCalledTimes(3);

    getLastSocket().triggerServerClose();
    clock.advance(3999);
    expect(webSocketFactory).toHaveBeenCalledTimes(3);
    clock.advance(1);
    expect(webSocketFactory).toHaveBeenCalledTimes(4);

    getLastSocket().triggerServerClose();
    clock.advance(7999);
    expect(webSocketFactory).toHaveBeenCalledTimes(4);
    clock.advance(1);
    expect(webSocketFactory).toHaveBeenCalledTimes(5);

    // Backoff caps at 8s for subsequent retries.
    getLastSocket().triggerServerClose();
    clock.advance(7999);
    expect(webSocketFactory).toHaveBeenCalledTimes(5);
    clock.advance(1);
    expect(webSocketFactory).toHaveBeenCalledTimes(6);
  });

  it('resets backoff to 1s after a successful reconnect', () => {
    const { worldSocket, webSocketFactory, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    getLastSocket().triggerServerClose();

    clock.advance(1000);
    expect(webSocketFactory).toHaveBeenCalledTimes(2);

    getLastSocket().triggerOpen();
    getLastSocket().triggerServerClose();

    // Backoff restarts at 1s rather than continuing to 2s.
    clock.advance(999);
    expect(webSocketFactory).toHaveBeenCalledTimes(2);
    clock.advance(1);
    expect(webSocketFactory).toHaveBeenCalledTimes(3);
  });

  it('never schedules more than one pending reconnect at a time', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    getLastSocket().triggerServerClose();
    expect(clock.pendingCount()).toBe(1);

    // A second close signal before the timer fires must not stack another retry.
    getLastSocket().triggerServerClose();
    expect(clock.pendingCount()).toBe(1);
  });

  it('dispose cancels pending reconnect and stops further retries', () => {
    const { worldSocket, webSocketFactory, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    getLastSocket().triggerServerClose();

    expect(clock.pendingCount()).toBe(1);
    worldSocket.dispose();
    expect(clock.pendingCount()).toBe(0);

    clock.advance(10_000);
    expect(webSocketFactory).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels a pending throttled move send', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    worldSocket.sendMove({ x: 5, y: 0, z: 0 });
    expect(clock.pendingCount()).toBe(1);

    worldSocket.dispose();
    clock.advance(1000);

    expect(getLastSocket().sent).toEqual([JSON.stringify({ type: 'move', moveTo: { x: 0, y: 0, z: 0 } })]);
  });
});
