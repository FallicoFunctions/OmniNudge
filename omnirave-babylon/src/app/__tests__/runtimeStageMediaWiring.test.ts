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
async function bootWorldPath(search: string, handoff?: { zoneMedia: unknown[] }, stopAt: 'visualizer' | 'show' = 'visualizer') {
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
  }));
  vi.doMock('../../media/stageMediaPlayer', () => ({ createStageMediaPlayer }));
  type EffectOptions = { getBeat?: () => { bass: number } | null } | undefined;
  const effectOptions: Record<string, EffectOptions> = {};
  const effect = (name: string) => (_scene: unknown, options: EffectOptions) => {
    effectOptions[name] = options;
    return { update: vi.fn(), dispose: vi.fn(), setEventState: vi.fn(), setControlMode: vi.fn() };
  };
  vi.doMock('../../scene/createStageVisualizer', () => ({
    createStageVisualizer: () => {
      if (stopAt === 'visualizer') throw new Error('stop after the world path');
      return { update: vi.fn(), dispose: vi.fn(), setEventState: vi.fn() };
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
  return { playerOptions, socketClock, effectOptions, readBeat };
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
