import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { createCompleteAvatarCrowd, type CompleteCrowdMode } from '../player/createCompleteAvatarCrowd';
import { createStudioEnvironment } from './studioEnvironment';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const count = document.querySelector<HTMLSelectElement>('#count')!;
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
const fullTransmission = document.querySelector<HTMLInputElement>('#full-transmission')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const measurement = document.querySelector<HTMLPreElement>('#measurement')!;
const measure = document.querySelector<HTMLButtonElement>('#measure')!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(.10, .115, .14, 1);
scene.skipPointerMovePicking = true;
const camera = new ArcRotateCamera('crowd-camera', Math.PI / 2, 1.40, 14, new Vector3(0, .85, -3.3), scene);
camera.minZ = .05; camera.lowerRadiusLimit = 2; camera.upperRadiusLimit = 35; camera.wheelPrecision = 35; camera.attachControl(canvas, true);
const fill = new HemisphericLight('crowd-fill', new Vector3(0, 1, 0), scene); fill.intensity = .85; fill.groundColor = new Color3(.14, .13, .12);
const key = new DirectionalLight('crowd-key', new Vector3(-.4, -1, -.6), scene); key.intensity = 2.1;
const ground = MeshBuilder.CreateGround('crowd-ground', { width: 50, height: 50 }, scene);
const material = new PBRMaterial('crowd-ground-material', scene); material.albedoColor = new Color3(.12, .13, .15); material.roughness = .9; material.metallic = 0; ground.material = material;
scene.environmentTexture = createStudioEnvironment(scene);
const instrumentation = new SceneInstrumentation(scene);
instrumentation.captureFrameTime = true;
const crowd = createCompleteAvatarCrowd(scene);
let loading = false;
let request = 0;
let last = performance.now();
let lastStatus = 0;
let sampling: { start: number; end: number; rows: { frame: number; cpu: number; calls: number }[] } | undefined;

async function rebuild() {
  const current = ++request;
  sampling = undefined; loading = true; measure.disabled = true; measure.textContent = 'Measure 5 seconds'; status.textContent = 'Loading crowd…';
  measurement.textContent = 'Crowd settings changed. Measure again once loading finishes.';
  try { await crowd.setCount(Number(count.value), quality.value === 'full' ? 'full' : 'adaptive', camera.position); }
  catch (error) { console.error(error); status.textContent = 'Crowd could not load. Check the local asset build.'; }
  finally { if (current === request) { loading = false; measure.disabled = false; } }
}
count.addEventListener('change', rebuild); quality.addEventListener('change', rebuild);
fullTransmission.addEventListener('change', () => {
  crowd.setFullQualityTransmission(fullTransmission.checked);
  sampling = undefined; measure.disabled = loading; measure.textContent = 'Measure 5 seconds';
  measurement.textContent = 'Transparency quality changed. Measure again to compare at the same camera and character detail.';
});
document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => { camera.alpha = Math.PI / 2; camera.beta = 1.40; camera.radius = 14; camera.target.set(0, .85, -3.3); });
measure.addEventListener('click', () => {
  engine.setSize(1280, 720);
  const start = performance.now() + 2000;
  sampling = { start, end: start + 5000, rows: [] }; measure.disabled = true; measure.textContent = 'Measuring…';
  measurement.textContent = 'Warming up for 2 seconds, then measuring 5 seconds at a fixed 1280 × 720 render resolution. Keep this view open.';
});
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
engine.runRenderLoop(() => {
  const now = performance.now(); const frame = now - last; last = now;
  const before = performance.now(); crowd.update(frame / 1000, camera.position); scene.render(); const cpu = performance.now() - before;
  const calls = instrumentation.drawCallsCounter.current;
  if (sampling && now >= sampling.start && now <= sampling.end && !loading && !document.hidden && frame < 1000) sampling.rows.push({ frame, cpu, calls });
  if (sampling && now > sampling.end) {
    const rows = sampling.rows; sampling = undefined; measure.disabled = loading; measure.textContent = 'Measure 5 seconds';
    const frames = rows.map(row => row.frame); const mean = frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length);
    const stats = crowd.stats();
    measurement.textContent = JSON.stringify({
      date: new Date().toISOString(), mode: quality.value, ...stats, viewport: [engine.getRenderWidth(), engine.getRenderHeight()], camera: camera.position.asArray(), samples: rows.length,
      averageFps: Number((1000 / Math.max(.001, mean)).toFixed(1)), medianFrameMs: Number(percentile(frames, .5).toFixed(2)), p95FrameMs: Number(percentile(frames, .95).toFixed(2)), medianCpuRenderMs: Number(percentile(rows.map(row => row.cpu), .5).toFixed(2)), medianDrawCalls: percentile(rows.map(row => row.calls), .5), valid: rows.length >= 15 && stats.pending === 0 && !stats.error
    }, null, 2);
    engine.resize();
  }
  if (!loading && now - lastStatus > 350) {
    const stats = crowd.stats(); status.textContent = stats.error ?? `${stats.actors} characters · ${stats.triangles.toLocaleString()} triangles · ${stats.detailCounts.join(' / ')} near / medium / far · ${stats.cachedAssets} shared assets · ${Math.round(engine.getFps())} FPS${stats.pending ? ' · updating detail…' : ''}`; lastStatus = now;
  }
});
window.addEventListener('resize', () => { if (!sampling) engine.resize(); });
window.addEventListener('pagehide', () => { engine.stopRenderLoop(); crowd.dispose(); instrumentation.dispose(); scene.dispose(); engine.dispose(); }, { once: true });
void rebuild();
