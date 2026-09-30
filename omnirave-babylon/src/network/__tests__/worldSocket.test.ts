import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorldSocket } from '../worldSocket';
import type { WorldSocketClock, WorldSocketLike, WorldSocketOptions } from '../worldSocket';

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

  confirmPosition(x: number, y = 0, z = 0, crouched = false): void {
    this.triggerMessage(JSON.stringify({
      type: 'world_snapshot', currentPlayerId: 'local',
      players: [{ id: 'local', position: { x, y, z }, ...(crouched ? { crouched: true } : {}) }],
    }));
  }
}

function createFakeClock(): WorldSocketClock & {
  advance: (ms: number) => void;
  elapseWithoutTimers: (ms: number) => void;
  pendingCount: () => number;
} {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { fireAt: number; callback: () => void }>();

  return {
    now: () => now,
    elapseWithoutTimers: (ms) => { now += ms; },
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

function setup(options: Pick<WorldSocketOptions, 'deferSnapshots'> = {}) {
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
    ...options,
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

  it('retains only the latest startup snapshot until every scene handler is ready', () => {
    const { worldSocket, getLastSocket } = setup({ deferSnapshots: true });
    const early = vi.fn(), late = vi.fn();
    worldSocket.onSnapshot(early);
    worldSocket.connect();
    getLastSocket().triggerOpen();
    for (let x = 1; x <= 100; x++) getLastSocket().confirmPosition(x);
    worldSocket.onSnapshot(late);
    expect(early).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
    worldSocket.resumeSnapshots();
    worldSocket.resumeSnapshots();
    expect(early).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
    expect(early.mock.calls[0][0].players[0].position.x).toBe(100);
    getLastSocket().confirmPosition(101);
    expect(early).toHaveBeenCalledTimes(2);
    expect(early.mock.calls[1][0].players[0].position.x).toBe(101);
    worldSocket.dispose();
  });

  it.each(['reconnect', 'close', 'error', 'dispose'] as const)('drops a held snapshot on %s', action => {
    const { worldSocket, getLastSocket } = setup({ deferSnapshots: true });
    const received = vi.fn();
    worldSocket.onSnapshot(received);
    worldSocket.connect();
    getLastSocket().triggerOpen();
    getLastSocket().confirmPosition(1);
    if (action === 'reconnect') worldSocket.reconnect('wss://example.test/ws', 'new-identity');
    else if (action === 'close') getLastSocket().triggerServerClose();
    else if (action === 'error') getLastSocket().onerror?.(new Error('offline'));
    else worldSocket.dispose();
    worldSocket.resumeSnapshots();
    expect(received).not.toHaveBeenCalled();
    worldSocket.dispose();
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

  it('sends one position across a minute of stationary frames, then sends movement immediately', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    for (let frame = 0; frame < 3600; frame++) {
      worldSocket.sendMove({ x: 1, y: 0, z: 2 });
      if (frame === 0) getLastSocket().confirmPosition(1, 0, 2);
      clock.advance(1000 / 60);
    }
    expect(getLastSocket().sent).toHaveLength(1);
    expect(clock.pendingCount()).toBe(0);
    worldSocket.sendMove({ x: 1.001, y: 0, z: 2 });
    expect(getLastSocket().sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'move', moveTo: { x: 1, y: 0, z: 2 } },
      { type: 'move', moveTo: { x: 1.001, y: 0, z: 2 } },
    ]);
  });

  it('cancels a queued excursion when the latest position returns to the sent position', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    getLastSocket().confirmPosition(0);
    worldSocket.sendMove({ x: 2, y: 0, z: 0 });
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    clock.advance(100);
    expect(getLastSocket().sent).toHaveLength(1);
    expect(clock.pendingCount()).toBe(0);
  });

  it('retries an unchanged target until the server finishes clamping its movement', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    const target = { x: 5, y: 0, z: 0 };
    worldSocket.sendMove(target);
    getLastSocket().confirmPosition(2.25);
    worldSocket.sendMove(target);
    clock.advance(100);
    getLastSocket().confirmPosition(4.5);
    worldSocket.sendMove(target);
    clock.advance(100);
    worldSocket.sendMove(target);
    expect(clock.pendingCount()).toBe(1);
    getLastSocket().confirmPosition(5);
    clock.advance(100);
    worldSocket.sendMove(target);
    expect(getLastSocket().sent).toHaveLength(3);
    expect(clock.pendingCount()).toBe(0);
  });

  it('keeps retrying an unacknowledged move and resumes after a server position correction', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    const target = { x: 5, y: 0, z: 0 };
    worldSocket.sendMove(target);
    clock.advance(100);
    worldSocket.sendMove(target);
    expect(getLastSocket().sent).toHaveLength(2);
    getLastSocket().confirmPosition(5);
    clock.advance(100);
    worldSocket.sendMove(target);
    expect(getLastSocket().sent).toHaveLength(2);
    getLastSocket().confirmPosition(4);
    worldSocket.sendMove(target);
    expect(getLastSocket().sent).toHaveLength(3);
  });

  it('does not discard a newer queued position when an older move is acknowledged', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    worldSocket.sendMove({ x: 2, y: 0, z: 0 });
    getLastSocket().confirmPosition(0);
    clock.advance(100);
    expect(JSON.parse(getLastSocket().sent[1]).moveTo.x).toBe(2);
  });

  it('copies immediate and queued positions from mutable caller vectors', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    const position = { x: 0, y: 0, z: 0 };
    worldSocket.sendMove(position);
    position.x = 2;
    worldSocket.sendMove(position);
    position.x = 99;
    clock.advance(100);
    expect(getLastSocket().sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'move', moveTo: { x: 0, y: 0, z: 0 } },
      { type: 'move', moveTo: { x: 2, y: 0, z: 0 } },
    ]);
  });

  it('replaces an overdue trailing move with the latest immediate position', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    worldSocket.sendMove({ x: 2, y: 0, z: 0 });
    clock.elapseWithoutTimers(120);
    worldSocket.sendMove({ x: 3, y: 0, z: 0 });
    clock.advance(100);
    expect(getLastSocket().sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'move', moveTo: { x: 0, y: 0, z: 0 } },
      { type: 'move', moveTo: { x: 3, y: 0, z: 0 } },
    ]);
  });

  it.each(['identity', 'network'] as const)('clears queued movement on %s reconnect and resends the first unchanged position', (kind) => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    worldSocket.sendMove({ x: 2, y: 0, z: 0 });
    if (kind === 'identity') {
      worldSocket.reconnect('wss://example.test/ws', 'fresh-token');
    } else {
      getLastSocket().triggerServerClose();
      clock.advance(1000);
    }
    worldSocket.sendMove({ x: 99, y: 0, z: 0 });
    getLastSocket().triggerOpen();
    clock.advance(100);
    expect(getLastSocket().sent).toEqual([]);
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    expect(getLastSocket().sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'move', moveTo: { x: 0, y: 0, z: 0 } },
    ]);
  });

  it('respawn cancels the old queued move and permits an immediate spawn position', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    worldSocket.sendMove({ x: 2, y: 0, z: 0 });
    worldSocket.sendRespawn();
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    clock.advance(100);
    expect(getLastSocket().sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'move', moveTo: { x: 0, y: 0, z: 0 } },
      { type: 'respawn' },
      { type: 'move', moveTo: { x: 0, y: 0, z: 0 } },
    ]);
  });

  it('does not retain movement before open, after error, or after disposal', () => {
    const { worldSocket, getLastSocket, clock } = setup();
    worldSocket.sendMove({ x: 99, y: 0, z: 0 });
    worldSocket.connect();
    worldSocket.sendMove({ x: 99, y: 0, z: 0 });
    getLastSocket().triggerOpen();
    worldSocket.sendMove({ x: 0, y: 0, z: 0 });
    worldSocket.sendMove({ x: 2, y: 0, z: 0 });
    getLastSocket().onerror?.({});
    worldSocket.sendMove({ x: 99, y: 0, z: 0 });
    clock.advance(100);
    worldSocket.dispose();
    worldSocket.sendMove({ x: 99, y: 0, z: 0 });
    expect(clock.pendingCount()).toBe(0);
    expect(getLastSocket().sent).toHaveLength(1);
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

  it('sends loadout with the exact expected shape', () => {
    const { worldSocket, getLastSocket } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();

    worldSocket.sendLoadout({ av: '1', bb: 'f', ht: '68', tp: 'mesh-neon' });

    expect(getLastSocket().sent).toEqual([
      JSON.stringify({ type: 'loadout', loadout: { av: '1', bb: 'f', ht: '68', tp: 'mesh-neon' } }),
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
        zoneMedia: [
          {
            zoneId: 'main_stage',
            trackId: 'v1',
            artist: 'Fallico',
            title: "Nick's Mix Vol. 13",
            playlistIndex: 0,
            playheadSeconds: 12,
            durationSeconds: 7827,
          },
        ],
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
        zoneMedia: [
          {
            zoneId: 'main_stage',
            trackId: 'v1',
            artist: 'Fallico',
            title: "Nick's Mix Vol. 13",
            playlistIndex: 0,
            playheadSeconds: 12,
            durationSeconds: 7827,
          },
        ],
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

  it('reconnect swaps to the new url/token without needing new listeners', () => {
    const { worldSocket, webSocketFactory, getLastSocket } = setup();
    const statuses: string[] = [];
    worldSocket.onStatusChange((status) => statuses.push(status));

    worldSocket.connect();
    const oldSocket = getLastSocket();
    oldSocket.triggerOpen();
    expect(webSocketFactory).toHaveBeenCalledWith('wss://example.test/ws?token=jwt-token');

    worldSocket.reconnect('wss://example.test/ws', 'new-jwt-token');

    expect(oldSocket.closed).toBe(true);
    expect(webSocketFactory).toHaveBeenCalledTimes(2);
    expect(webSocketFactory).toHaveBeenLastCalledWith('wss://example.test/ws?token=new-jwt-token');
    // The listener registered before reconnect is still live on this same
    // instance - no re-wiring required by the caller.
    getLastSocket().triggerOpen();
    expect(statuses).toEqual(['connecting', 'open', 'connecting', 'open']);
  });

  it('reconnect cancels a pending drop-triggered retry and resets its backoff', () => {
    const { worldSocket, webSocketFactory, getLastSocket, clock } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    getLastSocket().triggerServerClose();
    expect(clock.pendingCount()).toBe(1);

    worldSocket.reconnect('wss://example.test/ws', 'new-jwt-token');
    expect(clock.pendingCount()).toBe(0);
    expect(webSocketFactory).toHaveBeenCalledTimes(2);

    // Backoff restarts at 1s rather than continuing where the old attempt left off.
    getLastSocket().triggerOpen();
    getLastSocket().triggerServerClose();
    clock.advance(999);
    expect(webSocketFactory).toHaveBeenCalledTimes(2);
    clock.advance(1);
    expect(webSocketFactory).toHaveBeenCalledTimes(3);
  });

  it('reconnect after dispose is a no-op', () => {
    const { worldSocket, webSocketFactory, getLastSocket } = setup();
    worldSocket.connect();
    getLastSocket().triggerOpen();
    worldSocket.dispose();

    worldSocket.reconnect('wss://example.test/ws', 'new-jwt-token');
    expect(webSocketFactory).toHaveBeenCalledTimes(1);
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

it('sends posture changes at a confirmed position and waits for matching posture acknowledgement', () => {
  const { worldSocket, clock, getLastSocket } = setup();
  worldSocket.connect(); const socket = getLastSocket(); socket.triggerOpen();
  const position = { x: 1, y: 1.65, z: 0 };
  worldSocket.sendMove(position); socket.confirmPosition(1, 1.65);
  worldSocket.sendMove(position, true);
  // A prior standing snapshot cannot erase a queued crouch at the same point.
  socket.confirmPosition(1, 1.65); clock.advance(100);
  expect(JSON.parse(socket.sent[1])).toEqual({ type: 'move', moveTo: position, crouched: true });
  socket.confirmPosition(1, 1.65, 0, true);
  clock.advance(100); worldSocket.sendMove(position, true);
  expect(socket.sent).toHaveLength(2);
  worldSocket.sendMove(position, false);
  expect(JSON.parse(socket.sent[2])).toEqual({ type: 'move', moveTo: position });
  worldSocket.dispose();
});

it('cancels a queued crouch when standing resumes and clears posture across respawn/reconnect', () => {
  const { worldSocket, clock, getLastSocket } = setup();
  worldSocket.connect(); let socket = getLastSocket(); socket.triggerOpen();
  const position = { x: 0, y: 0, z: 0 };
  worldSocket.sendMove(position); socket.confirmPosition(0);
  worldSocket.sendMove(position, true); worldSocket.sendMove(position, false);
  clock.advance(100); expect(socket.sent).toHaveLength(1);
  worldSocket.sendMove(position, true); socket.confirmPosition(0, 0, 0, true);
  worldSocket.sendRespawn(); worldSocket.sendMove(position, false);
  expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'move', moveTo: position });
  worldSocket.sendMove(position, true);
  worldSocket.reconnect('wss://example.test/ws', 'new-token');
  socket = getLastSocket(); socket.triggerOpen(); clock.advance(100);
  expect(socket.sent).toEqual([]);
  worldSocket.sendMove(position);
  expect(JSON.parse(socket.sent[0])).toEqual({ type: 'move', moveTo: position });
  worldSocket.dispose();
});

it('pings the server clock after open, quickly at first, and feeds the replies to the clock', () => {
  const clock = createFakeClock();
  const sockets: FakeWebSocket[] = [];
  const serverClock = { now: vi.fn(() => undefined), addSample: vi.fn() };
  const worldSocket = createWorldSocket({
    url: 'wss://example.test/ws',
    token: 'jwt-token',
    webSocketFactory: (url) => {
      const socket = new FakeWebSocket(url);
      sockets.push(socket);
      return socket;
    },
    clock,
    serverClock,
  });
  worldSocket.connect();
  const socket = sockets[0];
  clock.advance(500);
  socket.triggerOpen();
  const pings = () => socket.sent.map((raw) => JSON.parse(raw)).filter((message) => message.type === 'time_sync');
  expect(pings()).toEqual([{ type: 'time_sync', clientTime: 500 }]);

  for (let second = 0; second < 3; second += 1) clock.advance(1000);
  expect(pings()).toHaveLength(4);
  clock.advance(14_000);
  expect(pings()).toHaveLength(4);
  clock.advance(1000);
  expect(pings()).toHaveLength(5);

  clock.elapseWithoutTimers(40);
  socket.triggerMessage(JSON.stringify({ type: 'time_sync', clientTime: 500, serverTime: 9_000_000 }));
  expect(serverClock.addSample).toHaveBeenCalledWith(500, 9_000_000, 18_540);

  worldSocket.dispose();
  expect(clock.pendingCount()).toBe(0);
});
