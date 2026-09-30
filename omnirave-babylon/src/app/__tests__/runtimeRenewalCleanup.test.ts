import { afterEach, expect, it, vi } from 'vitest';
import { mockShowControlRuntime } from './mockShowControlRuntime';
import { DEFAULT_AVATAR_DEFINITION } from '../../player/avatarDefinition';

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('releases the world socket, the stage player and the renewal when the boot fails after the socket opened', async () => {
  vi.resetModules();
  mockShowControlRuntime();
  window.history.replaceState(null, '', '/?perf=webgl&world=ws://localhost/ws&wtoken=fixture');
  const socket = {
    resumeSnapshots: vi.fn(), status: () => 'open',
    onSnapshot: vi.fn(), onStatusChange: vi.fn(), onChat: vi.fn(), connect: vi.fn(), dispose: vi.fn(),
    sendLoadout: vi.fn(), reconnect: vi.fn(),
  };
  vi.doMock('../../network/worldSocket', () => ({ createWorldSocket: () => socket }));
  const stopRenewal = vi.fn();
  vi.doMock('../../network/worldSessionRenewal', () => ({ keepWorldSessionAlive: vi.fn(() => stopRenewal) }));
  const rigs = { applySnapshot: vi.fn(), dispose: vi.fn(), setNameplatesVisible: vi.fn() };
  vi.doMock('../../player/createRemotePlayerRigs', () => ({ createRemotePlayerRigs: () => rigs }));
  const player = {
    getCurrentTime: () => 0, getDuration: () => 0, applyMedia: vi.fn(), dispose: vi.fn(),
    unlock: vi.fn(), isAudible: () => false,
  };
  vi.doMock('../../media/stageMediaPlayer', () => ({ createStageMediaPlayer: () => player }));
  // A part of the scene built after the world connects fails to load.
  vi.doMock('../../scene/createStageVisualizer', () => ({
    createStageVisualizer: () => { throw new Error('visualizer failed'); },
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
  await expect(createRuntime(host)).rejects.toThrow('visualizer failed');

  expect(socket.connect).toHaveBeenCalledTimes(1);
  expect(stopRenewal).toHaveBeenCalledTimes(1);
  // No ghost player in the world, and no music behind the error.
  expect(socket.dispose).toHaveBeenCalledTimes(1);
  expect(player.dispose).toHaveBeenCalledTimes(1);
  expect(rigs.dispose).toHaveBeenCalledTimes(1);
}, 20_000);

it.each([false, true])('cleans up a connection opened during scene loading, including a late module (late: %s)', async lateModule => {
  vi.resetModules();
  mockShowControlRuntime();
  window.history.replaceState(null, '', '/?perf=webgl&world=ws://localhost/ws&wtoken=fixture');
  const socket = { onStatusChange: vi.fn(), connect: vi.fn(), dispose: vi.fn() };
  const createSocket = vi.fn(() => socket);
  let finishModule!: () => void;
  const moduleReady = new Promise<void>(resolve => { finishModule = resolve; });
  vi.doMock('../../network/worldSocket', async () => {
    await moduleReady;
    return { createWorldSocket: createSocket };
  });
  if (!lateModule) finishModule();
  const stopRenewal = vi.fn();
  vi.doMock('../../network/worldSessionRenewal', () => ({ keepWorldSessionAlive: () => stopRenewal }));
  let failScene!: (error: Error) => void;
  const pendingScene = new Promise((_resolve, reject) => { failScene = reject; });
  const createScene = vi.fn(() => pendingScene);
  vi.doMock('../../scene/createMainStageScene', () => ({ createMainStageScene: createScene }));
  const engine = { dispose: vi.fn(), getHardwareScalingLevel: () => 1, setHardwareScalingLevel: vi.fn() };
  vi.doMock('@babylonjs/core/Engines/engine', () => ({ Engine: vi.fn(function () { return engine; }) }));
  const { createRuntime } = await import('../createRuntime');
  const host = document.createElement('div');
  const starting = createRuntime(host).catch(error => error as Error);
  await vi.waitFor(() => expect(createScene).toHaveBeenCalledTimes(1));
  if (!lateModule) await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
  failScene(new Error('venue failed'));
  expect((await starting as Error).message).toBe('venue failed');
  finishModule();
  await vi.dynamicImportSettled();
  expect(socket.connect).toHaveBeenCalledTimes(lateModule ? 0 : 1);
  expect(socket.dispose).toHaveBeenCalledTimes(lateModule ? 0 : 1);
  expect(stopRenewal).toHaveBeenCalledTimes(lateModule ? 0 : 1);
  expect(engine.dispose).toHaveBeenCalledTimes(1);
  expect(host.children).toHaveLength(0);
}, 20_000);
