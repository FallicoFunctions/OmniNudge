import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation.js';
// WebGL's modular Engine entry point does not register timing queries.
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js';
import '@babylonjs/core/Engines/Extensions/engine.query.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { createVenueCpuProfile } from './createVenueCpuProfile';
import type { FireworksPreviewAct } from '../ui/createReviewHud';
import type { StageEventStateInput } from '../scene/createStageVisualizer';

interface FrameSample {
  interval: number; cpu: number; gpu: number | null; draws: number; bundlesCreated: number; bundlesReused: number;
  activeMeshesMs: number; targetsMs: number; animationMs: number; particlesMs: number;
  renderMs: number; crowdMs: number; showsMs: number; renderedTriangles: number; activeParticles: number;
  showControlMs: number; fireworkQuads: number;
}

interface VenuePerformanceOptions {
  onPreviewFireworks?: (act: FireworksPreviewAct) => void;
  getEventState?: () => StageEventStateInput | null;
}

/** Local debug UI: fixed-resolution measurements, with explicit validity checks. */
export function createVenuePerformancePanel(host: HTMLElement, scene: Scene,
  getCrowdStats: () => unknown, options: VenuePerformanceOptions = {}) {
  const engine = scene.getEngine();
  const playerUi = new URLSearchParams(location.search).get('benchmarkUi') === 'player';
  const requestedSeconds = Number(new URLSearchParams(location.search).get('benchmarkSeconds'));
  const sampleSeconds = Number.isFinite(requestedSeconds) && requestedSeconds >= 8
    ? Math.min(60, requestedSeconds) : 8;
  const requestedPeers = new URLSearchParams(location.search).get('benchmarkPeers');
  const expectedRemoteAvatars = requestedPeers !== null && /^\d+$/.test(requestedPeers)
    && Number(requestedPeers) <= 32 ? Number(requestedPeers) : null;
  const requestedDetail = new URLSearchParams(location.search).get('benchmarkLocalDetail');
  const expectedLocalDetail = requestedDetail !== null && /^[012]$/.test(requestedDetail) ? Number(requestedDetail) : null;
  const expectFireworks = new URLSearchParams(location.search).get('benchmarkFireworks') === '1';
  const webgpu = engine.isWebGPU ? engine as import('@babylonjs/core/Engines/webgpuEngine').WebGPUEngine : undefined;
  const gpuDevice = (webgpu as unknown as { _device?: EventTarget } | undefined)?._device;
  const gpuErrors: string[] = [];
  let gpuErrorCount = 0, contextLost = false;
  const gpuError = (event: Event) => {
    gpuErrorCount++;
    if (gpuErrors.length < 3) gpuErrors.push((event as Event & { error?: { message?: string } }).error?.message ?? 'GPU validation error');
  };
  gpuDevice?.addEventListener('uncapturederror', gpuError);
  const contextLostObserver = engine.onContextLostObservable?.add(() => { contextLost = true; });
  const preserveGpuTiming = webgpu?.enableGPUTimingMeasurements ?? false;
  // Use completed-pass totals: GPU readback arrives asynchronously, so
  // repeatedly sampling `current` can count the same result several times.
  const gpuPassStarts = new Map<import('@babylonjs/core/Misc/perfCounter').PerfCounter,
    { name: string; count: number; total: number }>();
  const gpuPassCounters = () => [
    { name: 'Backbuffer', counter: webgpu?.gpuTimeInFrameForMainPass?.counter },
    ...scene.textures.filter(texture => texture.isRenderTarget).map(texture => ({ name: texture.name,
      counter: ((texture as import('@babylonjs/core/Materials/Textures/renderTargetTexture').RenderTargetTexture)
        .renderTarget as import('@babylonjs/core/Engines/WebGPU/webgpuRenderTargetWrapper').WebGPURenderTargetWrapper | null)
        ?.gpuTimeInFrame?.counter,
    })),
    ...(scene.activeCamera?._postProcesses ?? []).flatMap(post => post ? [{ name: `${post.name} input`,
      counter: (post.inputTexture as import('@babylonjs/core/Engines/WebGPU/webgpuRenderTargetWrapper').WebGPURenderTargetWrapper | null)
        ?.gpuTimeInFrame?.counter,
    }] : []),
  ];
  const panel = document.createElement('details');
  panel.dataset.testid = 'venue-performance';
  panel.style.cssText = 'position:absolute;z-index:60;right:18px;top:140px;width:420px;max-height:65vh;overflow:auto;padding:12px;background:#121923ee;color:#eef3ff;border:1px solid #6a8498;border-radius:8px;font:12px/1.5 monospace;pointer-events:auto';
  panel.innerHTML = `<summary>Venue performance</summary><p>3 seconds warm-up, then ${sampleSeconds} seconds at 1280 × 720. Keep this view open and the camera still.</p><button type="button">Measure venue performance</button><pre aria-label="Venue benchmark results" style="white-space:pre-wrap">Ready.</pre>`;
  const button = panel.querySelector('button')!;
  const output = panel.querySelector('pre')!;
  host.appendChild(panel);
  const priorCopyProfile = scene.metadata?.avatarCopyProfile;
  scene.metadata = { ...scene.metadata,
    avatarCopyProfile: { builds: 0, buildMs: 0, maxBuildMs: 0, instantiateMs: 0, configureMs: 0, releases: 0, releaseMs: 0 } };
  const eventSnapshot = () => options.getEventState?.() ?? null;
  let effectsSelect: HTMLSelectElement | undefined;
  const changeEffects = () => options.onPreviewFireworks?.(effectsSelect!.value as FireworksPreviewAct);
  if (options.onPreviewFireworks) {
    const label = document.createElement('label');
    effectsSelect = document.createElement('select');
    effectsSelect.name = 'venue-effects';
    for (const [value, text] of [['stop', 'Normal lighting'], ['minute-1', 'Fireworks crown'],
      ['minute-2', 'Fireworks orbits'], ['minute-3', 'Fireworks finale']]) {
      effectsSelect.add(new Option(text, value));
    }
    label.append('Venue effects ', effectsSelect); panel.insertBefore(label, output);
    effectsSelect.addEventListener('change', changeEffects);
  }
  if (scene.metadata?.staticPbrBindings) {
    const label = document.createElement('label'), check = document.createElement('input');
    check.type = 'checkbox'; check.checked = true;
    label.append(check, ' Reuse static material setup'); panel.insertBefore(label, output);
    check.addEventListener('change', () => { scene.metadata.staticPbrBindingsBypass = !check.checked; });
  }
  const originalRegionBaseline = scene.metadata?.transmissionRegionBaseline;
  const hadRegionBaseline = Object.hasOwn(scene.metadata ?? {}, 'transmissionRegionBaseline');
  const originalLocalBaseline = scene.metadata?.localAvatarDetailBaseline;
  const hadLocalBaseline = Object.hasOwn(scene.metadata ?? {}, 'localAvatarDetailBaseline');
  const localDetailLabel = document.createElement('label');
  const localDetailCheck = document.createElement('input'); localDetailCheck.type = 'checkbox';
  localDetailCheck.name = 'local-avatar-detail';
  localDetailCheck.checked = !scene.metadata?.localAvatarDetailBaseline;
  localDetailLabel.append(localDetailCheck, ' Adapt local avatar detail'); panel.insertBefore(localDetailLabel, output);
  const setLocalBaseline = () => { scene.metadata = { ...scene.metadata, localAvatarDetailBaseline: !localDetailCheck.checked }; };
  localDetailCheck.addEventListener('change', setLocalBaseline);
  const regionLabel = document.createElement('label');
  const regionCheck = document.createElement('input'); regionCheck.type = 'checkbox'; regionCheck.checked = !scene.metadata?.transmissionRegionBaseline;
  regionCheck.name = 'transmission-regions';
  regionLabel.append(regionCheck, ' Limit refraction background'); panel.insertBefore(regionLabel, output);
  const setRegionBaseline = () => { scene.metadata = { ...scene.metadata, transmissionRegionBaseline: !regionCheck.checked }; };
  regionCheck.addEventListener('change', setRegionBaseline);
  let disposed = false;
  let state: { start: number; end: number; previousFrame: number; frameStart: number;
    rows: FrameSample[]; camera: number[]; hidden: boolean; cameraMoved: boolean; compilationStart?: number;
    beforeStats: unknown; localDetail?: number; localDetailChanged: boolean;
    beforeEvent: StageEventStateInput | null; eventFingerprint: string; eventChanged: boolean; beforeCopyProfile: unknown } | undefined;
  let sceneInstrumentation: SceneInstrumentation | undefined;
  let engineInstrumentation: EngineInstrumentation | undefined;
  let cpuProfile: ReturnType<typeof createVenueCpuProfile> | undefined;
  const median = (values: number[], p = .5) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 100) / 100 : null;
  };
  const matrix = () => Array.from(scene.activeCamera?.getViewMatrix().asArray() ?? []);
  const localDetail = (): number => scene.metadata?.reviewRuntime?.reviewAvatar?.root.metadata?.avatarCompleteDetail ?? 0;
  const releaseInstruments = () => {
    cpuProfile?.dispose(); cpuProfile = undefined;
    sceneInstrumentation?.dispose(); sceneInstrumentation = undefined;
    if (engineInstrumentation) {
      engineInstrumentation.captureGPUFrameTime = preserveGpuTiming;
      engineInstrumentation.dispose(); engineInstrumentation = undefined;
    }
  };
  const finish = () => {
    const current = state!;
    const rows = current.rows;
    const afterStats = getCrowdStats();
    const crowdRequirementMet = expectedRemoteAvatars === null || [current.beforeStats, afterStats].every(stats => {
      const crowd = stats as { completePlayers?: number; animatingPlayers?: number; pending?: number } | null;
      return crowd?.completePlayers === expectedRemoteAvatars && crowd.animatingPlayers === expectedRemoteAvatars && crowd.pending === 0;
    });
    const endCamera = matrix();
    const cameraUnchanged = !current.cameraMoved && current.camera.length === endCamera.length
      && endCamera.every((value, i) => Math.abs(value - current.camera[i]) < .0001);
    const compilations = (engineInstrumentation?.shaderCompilationTimeCounter.count ?? 0) - (current.compilationStart ?? 0);
    const frameTotal = rows.reduce((sum, row) => sum + row.interval, 0);
    const renderer = engine.isWebGPU ? 'WebGPU' : 'WebGL';
    const localAvatar = scene.metadata?.reviewRuntime?.reviewAvatar as import('../player/createReviewAvatar').ReviewAvatar | undefined;
    const viewport = [engine.getRenderWidth(), engine.getRenderHeight()];
    const gpu = rows.flatMap(row => row.gpu === null ? [] : [row.gpu]);
    const fireworkActiveFrameRatio = rows.length ? rows.filter(row => row.fireworkQuads > 0).length / rows.length : 0;
    const fireworkRequirementMet = !expectFireworks || fireworkActiveFrameRatio >= .9;
    const localDetailRequirementMet = expectedLocalDetail === null
      || (!current.localDetailChanged && current.localDetail === expectedLocalDetail && localDetail() === expectedLocalDetail);
    const morphTextures = new Set(scene.textures.filter(texture => /morph texture/i.test(texture.name))
      .flatMap(texture => texture.getInternalTexture?.() ?? []));
    output.textContent = JSON.stringify({ date: new Date().toISOString(), renderer,
      diagnosticUi: playerUi ? 'hidden while measuring' : 'visible',
      sampleSeconds,
      venueOptimized: !scene.metadata?.venuePerformanceBaseline,
      avatarShaderCacheEnabled: !scene.metadata?.avatarShaderCacheBaseline,
      avatarBatchingEnabled: !scene.metadata?.avatarBatchingBaseline,
      avatarVertexBuffersInterleaved: engine.isWebGPU && scene.metadata?.avatarVertexBufferExperiment === true,
      avatarMultiMaterialBatchesEnabled: scene.metadata?.avatarMultiMaterialBatchExperiment === true,
      localAvatarBatchedParts: (scene.metadata?.reviewRuntime?.reviewAvatar?.meshes ?? [])
        .reduce((sum: number, mesh: import('@babylonjs/core/Meshes/abstractMesh').AbstractMesh) =>
          sum + Math.max(0, (mesh.metadata?.avatarBatchedParts?.length ?? 1) - 1), 0),
      flags: new URLSearchParams(location.search).get('perf') ?? '', viewport,
      samples: rows.length, averageFps: frameTotal ? Math.round(rows.length / frameTotal * 10000) / 10 : null,
      medianFrameMs: median(rows.map(row => row.interval)), p95FrameMs: median(rows.map(row => row.interval), .95),
      p99FrameMs: median(rows.map(row => row.interval), .99), maxFrameMs: median(rows.map(row => row.interval), 1),
      framesOver33Ms: rows.filter(row => row.interval > 1000 / 30).length,
      framesOver50Ms: rows.filter(row => row.interval > 50).length,
      framesOver100Ms: rows.filter(row => row.interval > 100).length,
      medianCpuFrameMs: median(rows.map(row => row.cpu)), medianGpuFrameMs: median(gpu), gpuSamples: gpu.length,
      cpuMethodProfile: cpuProfile?.report() ?? null,
      cpuProfileMeasuredFrames: cpuProfile?.measuredFrames() ?? 0,
      gpuVertexBufferBindingsPerFrame: cpuProfile?.vertexBindingsPerFrame() ?? null,
      backbufferAntialias: engine.getCreationOptions().antialias ?? null,
      gpuPassTimingEnabled: webgpu?.enableGPUTimingMeasurements ?? false,
      gpuPassTimings: [...gpuPassStarts].flatMap(([counter, start]) => {
        const measuredFrames = counter.count - start.count, elapsed = counter.total - start.total;
        return measuredFrames > 0 && elapsed > 0 ? [{ name: start.name, measuredFrames,
          averageGpuMs: Math.round(elapsed / measuredFrames / 1e4) / 100 }] : [];
      }),
      medianDrawCalls: median(rows.map(row => row.draws)),
      medianRenderedTriangles: median(rows.map(row => row.renderedTriangles)),
      compatibilityMode: 'compatibilityMode' in engine ? engine.compatibilityMode : null,
      commandReplayEnabled: engine.snapshotRendering,
      commandReplayMode: engine.snapshotRenderingMode,
      dynamicTransmissionEnabled: scene.metadata?.dynamicTransmissionExperiment === true,
      avatarMaterialPaletteEnabled: engine.isWebGPU && scene.metadata?.avatarMaterialPaletteExperiment === true,
      avatarSharedMorphsEnabled: engine.isWebGPU && scene.metadata?.avatarSharedMorphsExperiment === true,
      avatarCopyBoundsEnabled: scene.metadata?.avatarCopyBoundsExperiment === true,
      avatarLodReuseEnabled: scene.metadata?.avatarLodReuseExperiment === true,
      avatarInstanceMorphsEnabled: scene.metadata?.avatarInstanceMorphsExperiment === true,
      avatarMaterialVariantsEnabled: scene.metadata?.avatarMaterialVariantsExperiment === true,
      uniqueMorphTextureCount: morphTextures.size,
      morphTexturePayloadBytes: [...morphTextures].reduce((sum, texture) =>
        sum + texture.width * texture.height * texture.depth * 4 * Float32Array.BYTES_PER_ELEMENT, 0),
      avatarSmallDetailEnabled: scene.metadata?.avatarSmallDetailExperiment === true,
      avatarProjectedDetailEnabled: scene.metadata?.avatarProjectedDetailExperiment === true,
      transmissionBackgroundReused: engine.isWebGPU && scene.metadata?.reuseTransmissionExperiment === true,
      materialBindingCacheEnabled: scene.metadata?.materialBindingCacheEnabled === true,
      avatarGpuInstances: scene.metadata?.avatarGpuInstances ?? null,
      avatarInstanceShaderSources: new URLSearchParams(location.search).get('avatarShaderSource') === '1'
        ? scene.meshes.filter(mesh => mesh.material?.name.startsWith('crowd-morphs:')).slice(0, 2)
          .map(mesh => ({ mesh: mesh.name, source: mesh.subMeshes?.[0]?.effect?.vertexSourceCode })) : undefined,
      lightBindingCache: scene.metadata?.lightBindingCache ?? null,
      staticPbrBindings: scene.metadata?.staticPbrBindings ?? null,
      staticPbrBindingAudit: scene.metadata?.staticPbrBindingAudit ?? null,
      medianBundlesCreated: median(rows.map(row => row.bundlesCreated)), medianBundlesReused: median(rows.map(row => row.bundlesReused)),
      medianActiveMeshesMs: median(rows.map(row => row.activeMeshesMs)),
      medianRenderTargetsMs: median(rows.map(row => row.targetsMs)),
      medianAnimationMs: median(rows.map(row => row.animationMs)), medianParticlesMs: median(rows.map(row => row.particlesMs)),
      medianActiveParticles: median(rows.map(row => row.activeParticles)),
      beforeStageEvent: current.beforeEvent, afterStageEvent: eventSnapshot(), stageEventChanged: current.eventChanged,
      beforeAvatarCopyProfile: current.beforeCopyProfile, afterAvatarCopyProfile: scene.metadata.avatarCopyProfile,
      medianSceneRenderMs: median(rows.map(row => row.renderMs)),
      medianCrowdUpdateMs: median(rows.map(row => row.crowdMs)), medianShowUpdateMs: median(rows.map(row => row.showsMs)),
      medianShowControlMs: median(rows.map(row => row.showControlMs)),
      medianFireworkQuads: median(rows.map(row => row.fireworkQuads)), peakFireworkQuads: median(rows.map(row => row.fireworkQuads), 1),
      expectFireworks, fireworkActiveFrameRatio, fireworkRequirementMet,
      localAvatarDetail: localDetail(), localAvatarDetailChanged: current.localDetailChanged,
      localAvatarCharacter: localAvatar?.root.metadata?.avatarCompleteCharacter ?? null,
      localAvatarWardrobe: localAvatar?.wardrobe ? Object.fromEntries(localAvatar.wardrobe.slots.map(slot =>
        [slot, localAvatar.wardrobe!.isVisible(slot)])) : null,
      localAvatarDetailEnabled: !scene.metadata?.localAvatarDetailBaseline,
      localAvatarTriangles: (scene.metadata?.reviewRuntime?.reviewAvatar?.meshes ?? [])
        .reduce((sum: number, mesh: import('@babylonjs/core/Meshes/abstractMesh').AbstractMesh) => sum + mesh.getTotalIndices() / 3, 0),
      sceneMeshes: scene.meshes.length, activeMeshes: scene.getActiveMeshes().length,
      sceneMaterials: scene.materials.length, sceneTextures: scene.textures.length,
      renderTargets: scene.textures.filter(texture => texture.isRenderTarget).map(texture => ({
        name: texture.name, size: texture.getSize(),
        renderList: (texture as import('@babylonjs/core/Materials/Textures/renderTargetTexture').RenderTargetTexture).renderList?.length,
        samples: (texture as import('@babylonjs/core/Materials/Textures/renderTargetTexture').RenderTargetTexture).samples,
      })),
      activeMaterialGroups: Object.entries(scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length)
        .reduce<Record<string, { meshes: number; sample: string; unfrozen: number }>>((groups, mesh) => {
          const name = mesh.material?.name ?? '(none)';
          const row = groups[name] ??= { meshes: 0, sample: mesh.name, unfrozen: 0 };
          row.meshes++; if (!mesh.isWorldMatrixFrozen) row.unfrozen++;
          return groups;
        }, {})).sort((a, b) => b[1].meshes - a[1].meshes).slice(0, 24),
      postProcesses: scene.activeCamera?._postProcesses?.flatMap(p => p ? [p.name] : []),
      finishingIsolation: scene.metadata?.venueFinishingIsolation === true,
      cameraPosition: scene.activeCamera?.globalPosition.asArray(), cameraMatrix: current.camera,
      beforeCrowd: current.beforeStats, afterCrowd: afterStats, expectedRemoteAvatars, crowdRequirementMet,
      expectedLocalDetail, localDetailRequirementMet,
      shaderCompilationsDuringSample: compilations, hiddenDuringSample: current.hidden, cameraUnchanged,
      gpuValidationErrorsSincePanelOpened: gpuErrorCount, gpuValidationMessages: gpuErrors, contextLostSincePanelOpened: contextLost,
      renderTargetsEnabled: scene.renderTargetsEnabled,
      transmissionRegionsEnabled: !scene.metadata?.transmissionRegionBaseline,
      valid: crowdRequirementMet && localDetailRequirementMet && fireworkRequirementMet && rows.length >= 60 && !current.hidden && cameraUnchanged && !current.localDetailChanged && !current.eventChanged && compilations === 0
        && gpuErrorCount === 0 && !contextLost
        && viewport[0] === 1280 && viewport[1] === 720,
    }, null, 2);
    panel.style.visibility = '';
    state = undefined; button.disabled = false; regionCheck.disabled = false; localDetailCheck.disabled = false;
    if (effectsSelect) effectsSelect.disabled = false;
    releaseInstruments(); engine.resize();
  };
  const begin = engine.onBeginFrameObservable.add(() => {
    if (!state) return;
    state.frameStart = performance.now();
    cpuProfile?.beginFrame();
  });
  const end = engine.onEndFrameObservable.add(() => {
    if (!state || !sceneInstrumentation || !engineInstrumentation) return;
    const now = performance.now(), frameStart = state.frameStart;
    const inSample = now >= state.start && now < state.end;
    if (inSample) {
      if (!state.rows.length) for (const { name, counter } of gpuPassCounters()) {
        if (counter && !gpuPassStarts.has(counter)) gpuPassStarts.set(counter, { name, count: counter.count, total: counter.total });
      }
      state.compilationStart ??= engineInstrumentation.shaderCompilationTimeCounter.count;
      state.localDetail ??= localDetail();
      state.localDetailChanged ||= localDetail() !== state.localDetail;
      state.eventChanged ||= JSON.stringify(eventSnapshot()) !== state.eventFingerprint;
      state.hidden ||= document.hidden;
      const camera = matrix();
      state.cameraMoved ||= camera.length !== state.camera.length
        || camera.some((value, i) => Math.abs(value - state!.camera[i]) >= .0001);
      const gpu = engineInstrumentation.gpuFrameTimeCounter;
      const counters = engine.isWebGPU ? (engine as import('@babylonjs/core/Engines/webgpuEngine').WebGPUEngine).countersLastFrame : undefined;
      state.rows.push({ interval: frameStart - state.previousFrame, cpu: now - frameStart,
        gpu: gpu?.count && gpu.current > 0 ? gpu.current / 1e6 : null,
        draws: sceneInstrumentation.drawCallsCounter.current,
        renderedTriangles: scene.getActiveIndices() / 3,
        bundlesCreated: counters?.numBundleCreationNonCompatMode ?? 0,
        bundlesReused: counters?.numBundleReuseNonCompatMode ?? 0,
        activeMeshesMs: sceneInstrumentation.activeMeshesEvaluationTimeCounter.current,
        targetsMs: sceneInstrumentation.renderTargetsRenderTimeCounter.current,
        animationMs: sceneInstrumentation.animationsTimeCounter.current,
        particlesMs: sceneInstrumentation.particlesRenderTimeCounter.current,
        renderMs: scene.metadata?.venueCpuTimings?.render ?? 0,
        crowdMs: scene.metadata?.venueCpuTimings?.crowd ?? 0, showsMs: scene.metadata?.venueCpuTimings?.shows ?? 0,
        showControlMs: scene.metadata?.venueCpuTimings?.showControl ?? 0, fireworkQuads: scene.metadata?.venueCpuTimings?.fireworkQuads ?? 0,
        activeParticles: (scene.particleSystems ?? []).reduce((sum, system) => sum + system.getActiveCount(), 0) });
    }
    cpuProfile?.endFrame(inSample);
    state.previousFrame = frameStart;
    if (now >= state.end) finish();
  });
  const start = () => {
    if (state || disposed) return;
    gpuPassStarts.clear();
    const profileMode = new URLSearchParams(location.search).get('cpuProfile');
    if (['localhost', '127.0.0.1'].includes(location.hostname) && ['1', 'materials'].includes(profileMode ?? '')) {
      cpuProfile = createVenueCpuProfile(scene, { materials: profileMode === 'materials' });
    }
    const now = performance.now();
    state = { start: now + 3000, end: now + 3000 + sampleSeconds * 1000, previousFrame: now, frameStart: now,
      rows: [], camera: matrix(), hidden: document.hidden, cameraMoved: false, beforeStats: getCrowdStats(), localDetailChanged: false,
      beforeEvent: structuredClone(eventSnapshot()), eventFingerprint: JSON.stringify(eventSnapshot()), eventChanged: false,
      beforeCopyProfile: structuredClone(scene.metadata.avatarCopyProfile) };
    engine.setSize(1280, 720);
    sceneInstrumentation = new SceneInstrumentation(scene);
    sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
    sceneInstrumentation.captureRenderTargetsRenderTime = true;
    sceneInstrumentation.captureAnimationsTime = true;
    sceneInstrumentation.captureParticlesRenderTime = true;
    engineInstrumentation = new EngineInstrumentation(engine);
    engineInstrumentation.captureGPUFrameTime = true;
    engineInstrumentation.captureShaderCompilationTime = true;
    if (playerUi) panel.style.visibility = 'hidden';
    button.disabled = true; regionCheck.disabled = true; localDetailCheck.disabled = true; output.textContent = 'Measuring at 1280 × 720…';
    if (effectsSelect) effectsSelect.disabled = true;
  };
  const visibilityChanged = () => { if (state && document.hidden) state.hidden = true; };
  document.addEventListener('visibilitychange', visibilityChanged);
  button.addEventListener('click', start);
  return {
    isRunning: () => !!state,
    dispose() {
      if (disposed) return; disposed = true;
      gpuDevice?.removeEventListener('uncapturederror', gpuError);
      if (contextLostObserver) engine.onContextLostObservable.remove(contextLostObserver);
      if (state) engine.resize();
      state = undefined;
      if (priorCopyProfile === undefined) delete scene.metadata.avatarCopyProfile;
      else scene.metadata.avatarCopyProfile = priorCopyProfile;
      regionCheck.removeEventListener('change', setRegionBaseline);
      localDetailCheck.removeEventListener('change', setLocalBaseline);
      effectsSelect?.removeEventListener('change', changeEffects);
      if (effectsSelect && effectsSelect.value !== 'stop') options.onPreviewFireworks?.('stop');
      if (hadRegionBaseline) scene.metadata.transmissionRegionBaseline = originalRegionBaseline;
      else if (scene.metadata) delete scene.metadata.transmissionRegionBaseline;
      if (hadLocalBaseline) scene.metadata.localAvatarDetailBaseline = originalLocalBaseline;
      else if (scene.metadata) delete scene.metadata.localAvatarDetailBaseline;
      engine.onBeginFrameObservable.remove(begin); engine.onEndFrameObservable.remove(end);
      document.removeEventListener('visibilitychange', visibilityChanged);
      releaseInstruments(); button.removeEventListener('click', start); panel.remove();
    },
  };
}
