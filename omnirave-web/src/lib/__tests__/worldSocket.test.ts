import { describe, expect, it, vi } from 'vitest';
import { applyWorldSnapshot, buildWorldSocketUrl, openWorldSocket } from '../worldSocket';
import { DEFAULT_RUNTIME_SETTINGS } from '../settings';

describe('worldSocket', () => {
  it('applies authoritative zone and media updates for the current player', () => {
    const next = applyWorldSnapshot(
      {
        playerId: 'guest-1',
        playerName: 'Guest-1',
        worldSocketUrl: 'ws://localhost:8092/ws',
        mode: 'guest',
        activeZone: 'main_stage',
        lastVenue: 'main_stage',
        settings: DEFAULT_RUNTIME_SETTINGS,
        venueStatus: {
          currentTrackLabel: 'DJ Hyperbeam warming up',
          totalPlayers: 84,
          venuePlayers: 27,
          audienceLabel: 'Front Rail',
        },
        zoneMedia: [
          { zoneId: 'main_stage', videoId: 'main-stage-youtube', playlistIndex: 0, playheadSeconds: 10 },
        ],
      },
      {
        type: 'world_snapshot',
        currentPlayerId: 'guest-1',
        activeZone: 'underground',
        players: [
          { id: 'guest-1', position: { x: 42, y: 0, z: 9 }, zone: 'underground', loadout: {} },
        ],
        zoneMedia: [
          { zoneId: 'underground', videoId: 'techno-room-youtube', playlistIndex: 0, playheadSeconds: 22 },
        ],
      },
    );

    expect(next.activeZone).toBe('underground');
    expect(next.zoneMedia?.[0].videoId).toBe('techno-room-youtube');
    expect(next.players?.[0].zone).toBe('underground');
    expect(next.venueStatus).toEqual({
      currentTrackLabel: 'DJ Hyperbeam warming up',
      totalPlayers: 84,
      venuePlayers: 27,
      audienceLabel: 'Front Rail',
    });
  });

  it('routes chat messages from the world socket to the chat callback', () => {
    const listeners = new Map<string, Array<(event: MessageEvent | Event) => void>>();
    const socket = {
      readyState: 1,
      addEventListener(type: string, listener: (event: MessageEvent | Event) => void) {
        const bucket = listeners.get(type) ?? [];
        bucket.push(listener);
        listeners.set(type, bucket);
      },
      send: vi.fn(),
      close: vi.fn(),
    };
    const onChat = vi.fn();

    openWorldSocket({
      session: {
        playerId: 'guest-1',
        playerName: 'Guest-1',
        worldSocketUrl: 'ws://localhost:8092/ws',
        worldSessionToken: 'world-token-1',
        mode: 'guest',
        activeZone: 'main_stage',
        lastVenue: 'main_stage',
        settings: DEFAULT_RUNTIME_SETTINGS,
      },
      onSnapshot: vi.fn(),
      onChat,
      onError: vi.fn(),
      socketFactory: () => socket as unknown as WebSocket,
    });

    const handlers = listeners.get('message') ?? [];
    expect(handlers).toHaveLength(1);

    handlers[0]({
      data: JSON.stringify({
        type: 'chat_message',
        playerId: 'guest-2',
        playerName: 'Guest-2',
        body: 'Meet at the main stage',
        createdAt: '2026-06-02T12:00:00Z',
      }),
    } as MessageEvent);

    expect(onChat).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'guest-2',
        playerName: 'Guest-2',
        body: 'Meet at the main stage',
      }),
    );
  });

  it('sends a respawn event through the world socket helper', () => {
    const listeners = new Map<string, Array<(event: MessageEvent | Event) => void>>();
    const socket = {
      readyState: 1,
      addEventListener(type: string, listener: (event: MessageEvent | Event) => void) {
        const bucket = listeners.get(type) ?? [];
        bucket.push(listener);
        listeners.set(type, bucket);
      },
      send: vi.fn(),
      close: vi.fn(),
    };

    const worldSocket = openWorldSocket({
      session: {
        playerId: 'guest-1',
        playerName: 'Guest-1',
        worldSocketUrl: 'ws://localhost:8092/ws',
        worldSessionToken: 'world-token-1',
        mode: 'guest',
        activeZone: 'main_stage',
        lastVenue: 'main_stage',
        settings: DEFAULT_RUNTIME_SETTINGS,
      },
      onSnapshot: vi.fn(),
      onChat: vi.fn(),
      onError: vi.fn(),
      socketFactory: () => socket as unknown as WebSocket,
    });

    worldSocket.respawn();

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'respawn' }));
  });

  it('sends continuous move updates and respawn events on the world socket', () => {
    const socket = {
      readyState: 1,
      addEventListener: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
    };

    const worldSocket = openWorldSocket({
      session: {
        playerId: 'guest-1',
        playerName: 'Guest-1',
        worldSocketUrl: 'ws://localhost:8092/ws',
        worldSessionToken: 'world-token-1',
        mode: 'guest',
        activeZone: 'main_stage',
        lastVenue: 'main_stage',
        settings: DEFAULT_RUNTIME_SETTINGS,
      },
      onSnapshot: vi.fn(),
      onChat: vi.fn(),
      onError: vi.fn(),
      socketFactory: () => socket as unknown as WebSocket,
    });

    worldSocket.moveTo({ x: 12, y: 0, z: -3 });
    worldSocket.respawn();

    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        type: 'move',
        moveTo: { x: 12, y: 0, z: -3 },
      }),
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({
        type: 'respawn',
      }),
    );
  });

  it('uses the server-issued world session token instead of client identity query params', () => {
    const nextUrl = buildWorldSocketUrl({
      playerId: 'guest-1',
      playerName: 'Guest-1',
      worldSocketUrl: 'ws://localhost:8092/ws',
      worldSessionToken: 'world-token-2',
      mode: 'guest',
      activeZone: 'main_stage',
      lastVenue: 'main_stage',
      settings: DEFAULT_RUNTIME_SETTINGS,
      returnPoint: { x: 42, y: 0, z: 9 },
    });

    const parsed = new URL(nextUrl);
    expect(parsed.searchParams.get('token')).toBe('world-token-2');
    expect(parsed.searchParams.get('player_id')).toBeNull();
    expect(parsed.searchParams.get('player_name')).toBeNull();
    expect(parsed.searchParams.get('mode')).toBeNull();
    expect(parsed.searchParams.get('return_x')).toBeNull();
  });
});
