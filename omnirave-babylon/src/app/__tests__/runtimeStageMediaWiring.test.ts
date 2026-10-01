import { afterEach, expect, it, vi } from 'vitest';
import { mockShowControlRuntime } from './mockShowControlRuntime';
import { DEFAULT_AVATAR_DEFINITION } from '../../player/avatarDefinition';

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Boots the runtime until the world is connected; the scene part built next
// fails on purpose, so the test reads what the world path was given.
async function bootWorldPath(search: string, handoff?: { zoneMedia: unknown[] }, stopAt: 'visualizer' | 'show' = 'visualizer',
  trackStartServerMs?: number) {
  vi.resetModules();
  mockShowControlRuntime();
  window.history.replaceState(null, '', search);
  if (handoff) {
    vi.doMock('../../network/sessionExchange', () => ({
      parseSessionExchangeParams: () => ({ mode: 'guest', handoff: 'fixture' }),
      exchangeLaunchSession: async () => ({
        playerId: 'me', playerName: 'Me', mode: 'guest', worldSocketUrl: 'ws://localhost/ws',
        worldSessionToken: 'world-me', activeZone: 'main_stage', loadout: {}, ...handoff,
      }),
    }));
  }
  const socket = {
    resumeSnapshots: vi.fn(), status: () => 'open',
    onSnapshot: vi.fn(), onStatusChange: vi.fn(), onChat: vi.fn(), connect: vi.fn(), dispose: vi.fn(),
    sendLoadout: vi.fn(), reconnect: vi.fn(),
  };
  const createWorldSocket = vi.fn(() => socket);
  vi.doMock('../../network/worldSocket', () => ({ createWorldSocket }));
  vi.doMock('../../network/worldSessionRenewal', () => ({ keepWorldSessionAlive: () => () => {} }));
  vi.doMock('../../player/createRemotePlayerRigs', () => ({ createRemotePlayerRigs: () => ({
    applySnapshot: vi.fn(), dispose: vi.fn(), setNameplatesVisible: vi.fn(),
  }) }));
  const readBeat = vi.fn((out: { bass: number }) => {
    out.bass = 0.5;
    return true;
  });
  const createStageMediaPlayer = vi.fn(() => ({
    getCurrentTime: () => 0, getDuration: () => 0, applyMedia: vi.fn(), dispose: vi.fn(),
    unlock: vi.fn(), isAudible: () => false, readBeat, getFrequencyData: vi.fn(),
    getShowSeconds: () => undefined, getTrackStartServerMs: () => trackStartServerMs,
  }));
  vi.doMock('../../media/stageMediaPlayer', () => ({ createStageMediaPlayer }));
  type EffectOptions = { getBeat?: () => { bass: number; events?: unknown } | null } | undefined;
  const effectOptions: Record<string, EffectOptions> = {};
  const effectStates: Record<string, ReturnType<typeof vi.fn>> = {};
  const effect = (name: string) => (_scene: unknown, options: EffectOptions) => {
    effectOptions[name] = options;
    effectStates[name] = vi.fn();
    return { update: vi.fn(), dispose: vi.fn(), setEventState: effectStates[name], setControlMode: vi.fn() };
  };
  vi.doMock('../../scene/createStageVisualizer', () => ({
    createStageVisualizer: () => {
      if (stopAt === 'visualizer') throw new Error('stop after the world path');
      return { update: vi.fn(), dispose: vi.fn(), setEventState: vi.fn(), setTrackInfo: vi.fn() };
    },
  }));
  vi.doMock('../../scene/createImmersiveAudioShow', () => ({ createImmersiveAudioShow: effect('lasers') }));
  vi.doMock('../../scene/createCrownEffects', () => ({ createCrownEffects: effect('crown') }));
  vi.doMock('../../scene/createCascadeCourtLightFloor', () => ({ createCascadeCourtLightFloor: effect('floor') }));
  vi.doMock('../../scene/createHologramGrid', () => ({ createHologramGrid: effect('hologram') }));
  vi.doMock('../../scene/createStageAtmospherics', () => ({
    createStageAtmospherics: (scene: unknown, options: EffectOptions) => {
      effect('atmospherics')(scene, options);
      throw new Error('stop after the world path');
    },
  }));
  const engine = {
    dispose: vi.fn(), getFps: () => 60, getDeltaTime: () => 16, getHardwareScalingLevel: () => 1,
    onDisposeObservable: { addOnce: vi.fn() }, resize: vi.fn(), runRenderLoop: vi.fn(), setHardwareScalingLevel: vi.fn(),
  };
  vi.doMock('@babylonjs/core/Engines/engine', () => ({ Engine: vi.fn(function () { return engine; }) }));
  const scene = { metadata: { reviewRuntime: {
    reviewAvatar: { root: { metadata: {} }, meshes: [] }, avatarDefinition: DEFAULT_AVATAR_DEFINITION,
    restoreAvatarLoadout: vi.fn(async () => true),
  } }, getMeshByName: () => null, pick: vi.fn(), render: vi.fn() };
  vi.doMock('../../scene/createMainStageScene', () => ({ createMainStageScene: async () => scene }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204 }));

  const { createRuntime } = await import('../createRuntime');
  const host = document.createElement('div');
  document.body.appendChild(host);
  await expect(createRuntime(host)).rejects.toThrow('stop after the world path');
  type PlayerOptions =
    | { serverClock?: { now: unknown }; spectrum?: { fill: unknown }; beats?: { read: unknown } }
    | undefined;
  const playerOptions = (createStageMediaPlayer.mock.calls as unknown as [PlayerOptions][]).map(([options]) => options);
  const socketClock = (createWorldSocket.mock.calls as unknown as [{ serverClock?: unknown }][])[0]?.[0]?.serverClock;
  return { playerOptions, socketClock, effectOptions, effectStates, readBeat, socket };
}

it('gives the stage player the server clock the socket feeds, and the track spectrum', async () => {
  const { playerOptions, socketClock } = await bootWorldPath('/?perf=webgl&world=ws://localhost/ws&wtoken=fixture');
  expect(playerOptions).toHaveLength(1);
  expect(typeof playerOptions[0]?.serverClock?.now).toBe('function');
  expect(typeof playerOptions[0]?.spectrum?.fill).toBe('function');
  expect(typeof playerOptions[0]?.beats?.read).toBe('function');
  expect(socketClock === playerOptions[0]?.serverClock).toBe(true);
}, 20_000);

it('gives every light effect the one beat reading of the frame', async () => {
  const { effectOptions, readBeat } = await bootWorldPath(
    '/?perf=webgl&world=ws://localhost/ws&wtoken=fixture', undefined, 'show');
  const names = ['lasers', 'crown', 'floor', 'hologram', 'atmospherics'];
  expect(Object.keys(effectOptions).sort()).toEqual([...names].sort());
  const readings = names.map((name) => effectOptions[name]?.getBeat?.());
  for (const reading of readings) expect(reading?.bass).toBe(0.5);
  // One reading shared by all five: the player's reader moves its window on
  // each call, so a second call in the frame would split the hits.
  expect(new Set(readings).size).toBe(1);
  expect(readBeat).toHaveBeenCalledTimes(1);
}, 20_000);

it('gives the player started from the handoff the same clock and spectrum', async () => {
  const { playerOptions, socketClock } = await bootWorldPath('/?perf=webgl&mode=guest&handoff=fixture', {
    zoneMedia: [{ zoneId: 'main_stage', trackId: 'main-stage-set-01', playlistIndex: 0, playheadSeconds: 12.5, sampledAtMs: 1 }],
  });
  expect(playerOptions).toHaveLength(1);
  expect(typeof playerOptions[0]?.spectrum?.fill).toBe('function');
  expect(typeof playerOptions[0]?.beats?.read).toBe('function');
  expect(socketClock === playerOptions[0]?.serverClock).toBe(true);
}, 20_000);

it('runs the fireworks phases on the server clock and places them in the track', async () => {
  // A snapshot from 14:59:55 server time that still says "none": the
  // schedule says the lead-in, 5 s before the show.
  const serverNow = Date.UTC(2026, 5, 4, 14, 59, 55);
  const trackStart = serverNow - 100_000;
  const { socketClock, socket, effectStates, effectOptions } = await bootWorldPath(
    '/?perf=webgl&world=ws://localhost/ws&wtoken=fixture', undefined, 'show', trackStart);
  const local = Date.now();
  (socketClock as { addSample(sent: number, server: number, received: number): void }).addSample(local, serverNow, local);
  // Every snapshot listener, as the socket calls them.
  const onSnapshot = (snapshot: unknown) => {
    for (const [listener] of socket.onSnapshot.mock.calls) (listener as (value: unknown) => void)(snapshot);
  };
  onSnapshot({
    currentPlayerId: 'me', activeZone: 'main_stage', players: [],
    zoneMedia: [{ zoneId: 'main_stage', trackId: 'set', artist: '', title: '', playlistIndex: 0, playheadSeconds: 100, sampledAtMs: serverNow, durationSeconds: 0 }],
    zoneEvents: [{ zoneId: 'main_stage', phase: 'none', eventName: 'fireworks',
      activeStartMs: Date.UTC(2026, 5, 4, 14, 0, 0), periodSeconds: 3600, leadInSeconds: 10, activeSeconds: 300 }],
  });
  expect(effectStates.lasers.mock.lastCall?.[0]).toEqual({ phase: 'lead_in', countdownSeconds: 5 });
  expect(effectStates.hologram.mock.lastCall?.[0]).toEqual({ phase: 'lead_in', countdownSeconds: 5 });
  // The show at 15:00 is 105 s into the track.
  const events = effectOptions.lasers?.getBeat?.()?.events as { leadIns: Float64Array; actives: Float64Array };
  expect(Array.from(events.leadIns.slice(0, 2))).toEqual([95, 105]);
  expect(Array.from(events.actives.slice(0, 2))).toEqual([105, 405]);
}, 20_000);

