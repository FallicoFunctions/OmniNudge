import { afterEach, expect, it, vi } from 'vitest';
import { mockShowControlRuntime } from './mockShowControlRuntime';
import { DEFAULT_AVATAR_DEFINITION } from '../../player/avatarDefinition';

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('stops renewing the world token when the boot fails after the socket opened', async () => {
  vi.resetModules();
  mockShowControlRuntime();
  window.history.replaceState(null, '', '/?perf=webgl&world=ws://localhost/ws&wtoken=fixture');
  const socket = {
    onSnapshot: vi.fn(), onStatusChange: vi.fn(), onChat: vi.fn(), connect: vi.fn(), dispose: vi.fn(),
    sendLoadout: vi.fn(), reconnect: vi.fn(),
  };
  vi.doMock('../../network/worldSocket', () => ({ createWorldSocket: () => socket }));
  const stopRenewal = vi.fn();
  vi.doMock('../../network/worldSessionRenewal', () => ({ keepWorldSessionAlive: vi.fn(() => stopRenewal) }));
  vi.doMock('../../player/createRemotePlayerRigs', () => ({ createRemotePlayerRigs: () => ({
    applySnapshot: vi.fn(), dispose: vi.fn(), setNameplatesVisible: vi.fn(),
  }) }));
  vi.doMock('../../media/stageMediaPlayer', () => ({ createStageMediaPlayer: () => ({
    getCurrentTime: () => 0, getDuration: () => 0, applyMedia: vi.fn(), dispose: vi.fn(),
    unlock: vi.fn(), isAudible: () => false,
  }) }));
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
}, 20_000);
