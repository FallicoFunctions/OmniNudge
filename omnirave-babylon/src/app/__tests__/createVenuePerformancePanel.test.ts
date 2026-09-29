import { Observable } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createVenuePerformancePanel } from '../createVenuePerformancePanel';

vi.mock('@babylonjs/core/Instrumentation/sceneInstrumentation.js', () => ({ SceneInstrumentation: class {
  drawCallsCounter = { current: 42 };
  activeMeshesEvaluationTimeCounter = { current: 1 };
  renderTargetsRenderTimeCounter = { current: 2 };
  animationsTimeCounter = { current: .1 };
  particlesRenderTimeCounter = { current: .2 };
  dispose() {}
} }));
vi.mock('@babylonjs/core/Instrumentation/engineInstrumentation.js', () => ({ EngineInstrumentation: class {
  shaderCompilationTimeCounter = { count: 0 };
  gpuFrameTimeCounter = { count: 1, current: 3_000_000 };
  dispose() {}
} }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

function fixture(crowd: unknown = { players: 8 }) {
  vi.useFakeTimers({ toFake: ['performance'] });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let width = 1920, height = 1080;
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const engine = {
    isWebGPU: false, onBeginFrameObservable: new Observable(), onEndFrameObservable: new Observable(),
    getCreationOptions: () => ({ antialias: true }),
    getRenderWidth: () => width, getRenderHeight: () => height,
    setSize: (w: number, h: number) => { width = w; height = h; },
    resize: vi.fn(() => { width = 1920; height = 1080; }),
  };
  const scene = { metadata: { retained: 'unchanged' }, getEngine: () => engine, meshes: [], materials: [], textures: [],
    getActiveMeshes: () => ({ length: 0, data: [] }),
    getActiveIndices: () => 126,
    activeCamera: { getViewMatrix: () => ({ asArray: () => matrix }), globalPosition: { asArray: () => [0, 0, 0] } },
  } as unknown as Scene;
  const host = document.createElement('div'); document.body.append(host);
  const panel = createVenuePerformancePanel(host, scene, () => crowd);
  const button = host.querySelector('button')!;
  const frame = () => {
    vi.advanceTimersByTime(13); engine.onBeginFrameObservable.notifyObservers(null);
    vi.advanceTimersByTime(3); engine.onEndFrameObservable.notifyObservers(null);
  };
  const finish = () => { for (let i = 0; i < 700; i++) frame(); };
  return { host, scene, panel, button, engine, matrix, frame, finish, result: () => JSON.parse(host.querySelector('pre')!.textContent!) };
}

it.each([[8, 0], [8, 7], [8, 8], [16, 14], [16, 16]])('requires all %s loaded, animating avatars when requested (got %s)', (expected, count) => {
  vi.stubGlobal('location', { hostname: 'localhost', search: `?benchmarkPeers=${expected}` });
  const f = fixture({ completePlayers: count, animatingPlayers: count, pending: 0 });
  f.button.click(); f.finish();
  expect(f.result()).toMatchObject({ expectedRemoteAvatars: expected, crowdRequirementMet: count === expected, valid: count === expected });
  f.panel.dispose();
});

it.each([0, 1, 2])('enforces a requested full local model even when detail %s stays unchanged', detail => {
  vi.stubGlobal('location', { hostname: 'localhost', search: '?benchmarkLocalDetail=0' });
  const f = fixture();
  f.scene.metadata.reviewRuntime = { reviewAvatar: {
    root: { metadata: { avatarCompleteDetail: detail } }, meshes: [],
  } };
  f.button.click(); f.finish();
  expect(f.result()).toMatchObject({ expectedLocalDetail: 0, localDetailRequirementMet: detail === 0, valid: detail === 0 });
  f.panel.dispose();
});

it.each([0, 420])('requires rendered fireworks when requested, independent of the stage preset (%s quads)', quads => {
  vi.stubGlobal('location', { hostname: 'localhost', search: '?benchmarkFireworks=1' });
  const f = fixture();
  f.scene.metadata.venueCpuTimings = { showControl: 2.5, fireworkQuads: quads };
  f.button.click(); f.finish();
  expect(f.result()).toMatchObject({ expectFireworks: true, medianShowControlMs: 2.5,
    medianFireworkQuads: quads, peakFireworkQuads: quads, fireworkActiveFrameRatio: quads ? 1 : 0,
    fireworkRequirementMet: quads > 0, valid: quads > 0 });
  f.panel.dispose();
});

it('rejects a fireworks sample that goes inactive during most of the measurement', () => {
  vi.stubGlobal('location', { hostname: 'localhost', search: '?benchmarkFireworks=1' });
  const f = fixture();
  f.scene.metadata.venueCpuTimings = { fireworkQuads: 420 };
  f.button.click();
  for (let i = 0; i < 220; i++) f.frame();
  f.scene.metadata.venueCpuTimings.fireworkQuads = 0;
  f.finish();
  expect(f.result()).toMatchObject({ peakFireworkQuads: 420, fireworkRequirementMet: false, valid: false });
  expect(f.result().fireworkActiveFrameRatio).toBeGreaterThan(0);
  expect(f.result().fireworkActiveFrameRatio).toBeLessThan(.9);
  f.panel.dispose();
});

it('drives the real effects callback, locks the preset during measurement and restores server effects on disposal', () => {
  const f = fixture(); f.panel.dispose();
  const onPreviewFireworks = vi.fn();
  const panel = createVenuePerformancePanel(f.host, f.scene, () => ({}), {
    onPreviewFireworks, getEventState: () => ({ phase: 'active', activeMinute: 3 }),
  });
  const select = f.host.querySelector<HTMLSelectElement>('select[name="venue-effects"]')!;
  select.value = 'minute-3'; select.dispatchEvent(new Event('change'));
  expect(onPreviewFireworks).toHaveBeenLastCalledWith('minute-3');
  f.host.querySelector('button')!.click(); expect(select.disabled).toBe(true);
  f.finish(); expect(select.disabled).toBe(false);
  expect(f.result()).toMatchObject({ beforeStageEvent: { phase: 'active', activeMinute: 3 },
    afterStageEvent: { phase: 'active', activeMinute: 3 }, stageEventChanged: false, valid: true });
  panel.dispose(); expect(onPreviewFireworks).toHaveBeenLastCalledWith('stop');
});

it('rejects GPU failures even before the sample starts and removes its device listener on disposal', () => {
  const f = fixture(); f.panel.dispose();
  const device = new EventTarget(), removed = vi.spyOn(device, 'removeEventListener');
  const lost = new Observable();
  Object.assign(f.engine, { isWebGPU: true, _device: device, onContextLostObservable: lost });
  const panel = createVenuePerformancePanel(f.host, f.scene, () => ({}));
  const error = new Event('uncapturederror'); Object.assign(error, { error: { message: 'Invalid ShaderModule' } });
  device.dispatchEvent(error);
  f.host.querySelector('button')!.click(); f.finish();
  expect(f.result()).toMatchObject({ valid: false, gpuValidationErrorsSincePanelOpened: 1,
    gpuValidationMessages: ['Invalid ShaderModule'], contextLostSincePanelOpened: false });
  lost.notifyObservers(null);
  f.host.querySelector('button')!.click(); f.finish();
  expect(f.result()).toMatchObject({ valid: false, contextLostSincePanelOpened: true });
  panel.dispose(); expect(removed).toHaveBeenCalledWith('uncapturederror', expect.any(Function));
  expect(lost.hasObservers()).toBe(false);
});

it('rejects an effect change even if it returns and records particles and long frame intervals', () => {
  const f = fixture(); f.panel.dispose();
  let event = { phase: 'active' as const, activeMinute: 1 };
  f.scene.particleSystems = [{ getActiveCount: () => 40 }, { getActiveCount: () => 60 }] as never;
  const panel = createVenuePerformancePanel(f.host, f.scene, () => ({}), { getEventState: () => event });
  f.host.querySelector('button')!.click();
  for (let i = 0; i < 200; i++) f.frame();
  event = { phase: 'active', activeMinute: 3 }; f.frame();
  event = { phase: 'active', activeMinute: 1 };
  vi.advanceTimersByTime(110); f.frame(); f.finish();
  expect(f.result()).toMatchObject({ valid: false, stageEventChanged: true, medianActiveParticles: 100,
    maxFrameMs: 126, framesOver33Ms: 1, framesOver50Ms: 1, framesOver100Ms: 1 });
  expect(f.result().beforeStageEvent.activeMinute).toBe(1);
  panel.dispose();
});

it('measures the player UI with diagnostic chrome hidden and restores the report afterward', () => {
  vi.stubGlobal('location', { hostname: 'localhost', search: '?benchmarkUi=player' });
  const f = fixture();
  const chrome = f.host.querySelector<HTMLElement>('[data-testid="venue-performance"]')!;
  f.button.click();
  expect(chrome.style.visibility).toBe('hidden');
  f.finish();
  expect(chrome.style.visibility).toBe('');
  expect(f.result()).toMatchObject({ diagnosticUi: 'hidden while measuring', hiddenDuringSample: false, valid: true });
  f.panel.dispose();
});

it('collects the full requested thirty-second sample instead of ending at eight seconds', () => {
  vi.stubGlobal('location', { hostname: 'localhost', search: '?benchmarkSeconds=30' });
  const f = fixture(); f.button.click(); f.finish();
  expect(f.panel.isRunning()).toBe(true);
  for (let i = 0; i < 1400; i++) f.frame();
  expect(f.panel.isRunning()).toBe(false);
  expect(f.result()).toMatchObject({ sampleSeconds: 30, valid: true });
  expect(f.result().samples).toBeGreaterThan(1800);
  f.panel.dispose();
});

it('measures fixed dimensions, reports frame costs, restores sizing and releases its listeners', () => {
  const f = fixture();
  const region = f.host.querySelector<HTMLInputElement>('input[name="transmission-regions"]')!; region.click();
  const local = f.host.querySelector<HTMLInputElement>('input[name="local-avatar-detail"]')!; local.click();
  expect(f.scene.metadata.transmissionRegionBaseline).toBe(true);
  expect(f.scene.metadata.localAvatarDetailBaseline).toBe(true);
  f.button.click();
  expect(region.disabled).toBe(true);
  expect(local.disabled).toBe(true);
  expect(f.button.disabled).toBe(true); expect(f.engine.getRenderWidth()).toBe(1280);
  f.finish();
  expect(f.result()).toMatchObject({ valid: true, viewport: [1280, 720], medianFrameMs: 16,
    medianCpuFrameMs: 3, medianGpuFrameMs: 3, medianDrawCalls: 42, medianRenderedTriangles: 42,
    beforeCrowd: { players: 8 }, afterCrowd: { players: 8 } });
  expect(f.button.disabled).toBe(false); expect(region.disabled).toBe(false); expect(f.engine.getRenderWidth()).toBe(1920);
  expect(local.disabled).toBe(false);
  expect(f.engine.resize).toHaveBeenCalledTimes(1);
  f.panel.dispose(); f.panel.dispose();
  expect(f.engine.onBeginFrameObservable.hasObservers()).toBe(false);
  expect(f.engine.onEndFrameObservable.hasObservers()).toBe(false);
  expect(f.host.children).toHaveLength(0);
  expect(f.scene.metadata).toEqual({ retained: 'unchanged' });
});

it.each(['hidden', 'camera', 'detail'])('rejects a %s change even when it returns to the starting state', change => {
  const f = fixture(); f.button.click();
  if (change === 'hidden') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  } else if (change === 'camera') {
    for (let i = 0; i < 200; i++) f.frame();
    f.matrix[12] = 1; f.frame(); f.matrix[12] = 0;
  } else {
    f.scene.metadata.reviewRuntime = { reviewAvatar: { root: { metadata: { avatarCompleteDetail: 0 } } } };
    for (let i = 0; i < 200; i++) f.frame();
    f.scene.metadata.reviewRuntime.reviewAvatar.root.metadata.avatarCompleteDetail = 1;
    f.frame();
    f.scene.metadata.reviewRuntime.reviewAvatar.root.metadata.avatarCompleteDetail = 0;
  }
  f.finish(); expect(f.result().valid).toBe(false); f.panel.dispose();
});

it('restores viewport and existing comparison state when disposed during measurement', () => {
  const f = fixture(); f.panel.dispose(); f.scene.metadata.transmissionRegionBaseline = true;
  f.scene.metadata.localAvatarDetailBaseline = true;
  const panel = createVenuePerformancePanel(f.host, f.scene, () => ({}));
  f.host.querySelector<HTMLInputElement>('input[name="transmission-regions"]')!.click();
  f.host.querySelector<HTMLInputElement>('input[name="local-avatar-detail"]')!.click(); f.host.querySelector('button')!.click();
  expect(f.engine.getRenderWidth()).toBe(1280); expect(f.scene.metadata.transmissionRegionBaseline).toBe(false);
  expect(f.scene.metadata.localAvatarDetailBaseline).toBe(false);
  panel.dispose();
  expect(f.engine.getRenderWidth()).toBe(1920); expect(f.scene.metadata.transmissionRegionBaseline).toBe(true);
  expect(f.scene.metadata.localAvatarDetailBaseline).toBe(true);
});

it('counts completed asynchronous GPU results once and deduplicates shared pass targets', () => {
  const f = fixture(); f.panel.dispose();
  const main = { count: 50, total: 100_000_000, current: 999_000_000 };
  const targetCounter = { count: 50, total: 150_000_000, current: 999_000_000 };
  const target = { gpuTimeInFrame: { counter: targetCounter } };
  Object.assign(f.engine, { isWebGPU: true, enableGPUTimingMeasurements: true, gpuTimeInFrameForMainPass: { counter: main } });
  f.scene.textures.push({ name: 'opaqueSceneTexture', isRenderTarget: true, renderTarget: target,
    getSize: () => ({ width: 1024, height: 1024 }) } as never);
  f.scene.activeCamera!._postProcesses = [{ name: 'shared', inputTexture: target } as never];
  const panel = createVenuePerformancePanel(f.host, f.scene, () => ({}));
  const button = f.host.querySelector('button')!; button.click();
  for (let i = 0; i < 200; i++) f.frame();
  main.count += 5; main.total += 10_000_000;
  targetCounter.count += 5; targetCounter.total += 15_000_000;
  f.finish();
  expect(f.result().gpuPassTimings).toEqual([
    { name: 'Backbuffer', measuredFrames: 5, averageGpuMs: 2 },
    { name: 'opaqueSceneTexture', measuredFrames: 5, averageGpuMs: 3 },
  ]);
  button.click(); f.finish();
  expect(f.result().gpuPassTimings).toEqual([]);
  panel.dispose();
});

it.each(['localhost', 'example.com'])('limits CPU method timing to loopback (%s)', hostname => {
  vi.stubGlobal('location', { hostname, search: '?cpuProfile=1' });
  const f = fixture(); f.button.click(); f.finish();
  if (hostname === 'localhost') {
    expect(f.result().cpuMethodProfile).not.toBeNull();
    expect(f.result().cpuProfileMeasuredFrames).toBe(f.result().samples);
    f.button.click(); f.finish();
    expect(f.result().cpuProfileMeasuredFrames).toBe(f.result().samples);
  } else {
    expect(f.result().cpuMethodProfile).toBeNull();
    expect(f.result().cpuProfileMeasuredFrames).toBe(0);
  }
  f.panel.dispose();
});

it('restores method instrumentation when the panel closes during a CPU profile', () => {
  vi.stubGlobal('location', { hostname: 'localhost', search: '?cpuProfile=1' });
  const render = Mesh.prototype.render;
  const f = fixture(); f.button.click(); f.frame();
  expect(Mesh.prototype.render).not.toBe(render);
  f.panel.dispose();
  expect(Mesh.prototype.render).toBe(render);
  expect(f.engine.onBeginFrameObservable.hasObservers()).toBe(false);
  expect(f.engine.onEndFrameObservable.hasObservers()).toBe(false);
});
