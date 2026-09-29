import { createStudioEnvironment } from './studioEnvironment';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { CreateScreenshotUsingRenderTargetAsync } from '@babylonjs/core/Misc/screenshotTools.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
// Register floor-line shaders before the preview's first render.
import '@babylonjs/core/Shaders/color.vertex.js';
import '@babylonjs/core/Shaders/color.fragment.js';
import { createCompleteAvatar } from '../player/createCompleteAvatar';
import type { ReviewAvatar } from '../player/createReviewAvatar';
import type { AvatarAnimationState } from '../player/avatarAnimationState';
import type { CompleteExpression, CompleteBlink } from '../player/completeAvatarExpression';
import { createCompleteWardrobeControls } from '../ui/createCompleteWardrobeControls';
import { publicUrl } from '../app/publicUrl';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const character = document.querySelector<HTMLSelectElement>('#character')!;
const outfit = document.querySelector<HTMLSelectElement>('#outfit')!;
const frame = document.querySelector<HTMLInputElement>('#frame')!;
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
const crouch = document.querySelector<HTMLInputElement>('#crouch')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const expression = document.querySelector<HTMLSelectElement>('#expression')!;
const expressionStrength = document.querySelector<HTMLInputElement>('#expression-strength')!;
const blink = document.querySelector<HTMLSelectElement>('#blink')!;
const hairMotion = document.querySelector<HTMLInputElement>('#hair-motion')!;
const exportImage = document.querySelector<HTMLButtonElement>('#export-image')!;
const imagePreview = document.querySelector<HTMLImageElement>('#image-preview')!;
const imageDownload = document.querySelector<HTMLAnchorElement>('#image-download')!;
const movingGround = document.createElement('input');
movingGround.type = 'checkbox'; movingGround.checked = true;
const movingGroundLabel = document.createElement('label');
movingGroundLabel.append(movingGround, ' Moving ground');
pause.insertAdjacentElement('afterend', movingGroundLabel);
const previewParameters = new URLSearchParams(location.search);
// Match the display's physical pixels; CSS-sized buffers are soft on Retina.
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, limitDeviceRatio: 2 }, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(.10, .115, .14, 1);
const camera = new ArcRotateCamera('complete-camera', Math.PI / 2, 1.48, 2.35, new Vector3(0, .90, 0), scene);
camera.minZ = .01; camera.lowerRadiusLimit = .22; camera.upperRadiusLimit = 5;
camera.wheelPrecision = 90; camera.attachControl(canvas, true);
const hemi = new HemisphericLight('complete-fill', new Vector3(0, 1, 0), scene);
hemi.intensity = .85; hemi.groundColor = new Color3(.14, .13, .12);
const key = new DirectionalLight('complete-key', new Vector3(-.4, -1, -.6), scene);
key.position.set(2, 4, 3); key.intensity = 2.1;
const rim = new DirectionalLight('complete-rim', new Vector3(.6, -.5, .8), scene); rim.intensity = .8;
const ground = MeshBuilder.CreateGround('complete-ground', { width: 8, height: 10 }, scene);
const mat = new PBRMaterial('complete-ground-material', scene); mat.albedoColor = new Color3(.12, .13, .15); mat.roughness = .9; mat.metallic = 0; ground.material = mat; ground.receiveShadows = true;
const floorLines: Vector3[][] = [];
for (let i = -8; i <= 9; i++) floorLines.push([new Vector3(-4,.002,i*.5),new Vector3(4,.002,i*.5)]);
for (let i = -8; i <= 8; i++) floorLines.push([new Vector3(i*.5,.002,-4),new Vector3(i*.5,.002,4.5)]);
const groundGuides = MeshBuilder.CreateLineSystem('walking-floor-guides',{lines:floorLines},scene);
groundGuides.color = new Color3(.30,.32,.35); groundGuides.alpha = .3; groundGuides.isPickable = false;
const shadows = new ShadowGenerator(1024, key); shadows.usePercentageCloserFiltering = true; shadows.bias = .0001;
scene.environmentTexture = createStudioEnvironment(scene);
let avatar: ReviewAvatar | undefined;
let motion: AvatarAnimationState = previewParameters.get('motion') === 'walk' ? 'walk' : previewParameters.get('motion') === 'run' ? 'run' : 'idle';
let paused = false;
let elapsed = 0;
let generation = 0;
let currentView = ['front','three-quarter','side','back','face','hair','hands','feet'].includes(previewParameters.get('view') ?? '')
  ? previewParameters.get('view')! : 'front';
let imageUrl: string | undefined;
let wardrobeControls: ReturnType<typeof createCompleteWardrobeControls> | undefined;
let unsubscribeWardrobe: (() => void) | undefined;
function savePreviewView() {
  const url = new URL(location.href);
  url.searchParams.set('character',character.value);
  url.searchParams.set('motion',motion);
  url.searchParams.set('view',currentView);
  history.replaceState(null,'',url);
}
function applyView(view: string) {
  currentView = view;
  const male = character.value === 'male';
  camera.alpha = view === 'side' ? 0 : view === 'back' ? -Math.PI / 2 : view === 'three-quarter' ? Math.PI * .32 : view === 'hair' ? Math.PI * .40 : Math.PI / 2;
  camera.beta = 1.48;
  camera.radius = view === 'face' ? (male ? .60 : .48) : view === 'hair' ? .68 : view === 'hands' ? .50 : view === 'feet' ? .8 : male ? 2.55 : 2.35;
  camera.target.set(view === 'hands' ? (male ? .24 : .27) : view === 'hair' && !male ? -.025 : 0, view === 'face' ? (male ? 1.69 : 1.62) : view === 'hair' ? (male ? 1.71 : 1.64) : view === 'hands' ? (male ? .82 : .76) : view === 'feet' ? .18 : .90, 0);
  savePreviewView();
}
function activeGroup() { return avatar?.animationGroups?.find(g => g.name === motion); }
function setMotion(next: AvatarAnimationState) { motion = next; avatar?.animate(elapsed, motion, crouch.checked); activeGroup()?.play(true); paused = false; avatar?.expression?.setPaused(false); pause.textContent = 'Pause'; pause.setAttribute('aria-pressed', 'false'); frame.max = String(activeGroup()?.to ?? 90); document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.motion === motion))); savePreviewView(); }
async function load() {
  const current = ++generation; const sex = character.value === 'female' ? 'female' : 'male';
  exportImage.disabled = true;
  document.querySelector<HTMLElement>('#image-output')!.hidden = true;
  status.textContent = 'Loading character…';
  document.querySelector<HTMLImageElement>('#reference')!.src = publicUrl(`/assets/avatars/complete-pair/${sex}-reference.png`);
  document.querySelector<HTMLAnchorElement>('#venue')!.href = `/?avatarComplete=${sex}`;
  const next = await createCompleteAvatar(scene, sex);
  if (current !== generation) { next.dispose?.(); next.root.dispose(false, true); return; }
  wardrobeControls?.dispose(); unsubscribeWardrobe?.();
  avatar?.dispose?.(); avatar?.root.dispose(false, true); avatar = next;
  next.meshes.forEach(m => shadows.addShadowCaster(m));
  setMotion(motion); applyExpression(); applyView(currentView);
  if (next.wardrobe) {
    wardrobeControls = createCompleteWardrobeControls(next.wardrobe);
    document.querySelector('#wardrobe')!.appendChild(wardrobeControls.element);
    const syncOutfit = () => {
      const worn = (slot: typeof next.wardrobe.slots[number]) => next.wardrobe!.isVisible(slot);
      outfit.value = next.wardrobe!.slots.every(worn) ? 'complete'
        : next.wardrobe!.slots.every(slot => worn(slot) === (slot !== 'jacket')) ? 'no-jacket'
          : next.wardrobe!.slots.every(slot => worn(slot) === (slot === 'hair')) ? 'body' : 'custom';
    };
    unsubscribeWardrobe = next.wardrobe.subscribe(syncOutfit); syncOutfit();
  }
  const triangles = next.meshes.reduce((sum, m) => sum + m.getTotalIndices() / 3, 0);
  status.textContent = `${sex === 'male' ? 'Luxury male' : 'PLURR female'} · ${Math.round(triangles).toLocaleString()} triangles · ${next.skeletons?.[0]?.bones.length} bones · idle, walk, run and crouch · expressions and hair motion`;
  exportImage.disabled = false;
}
function applyOutfit() {
  const preset = outfit.value === 'custom' ? 'complete' : outfit.value;
  outfit.value = preset;
  const wardrobe = avatar?.wardrobe;
  for (const slot of wardrobe?.slots ?? []) wardrobe!.setVisible(slot,
    preset === 'complete' || (preset === 'no-jacket' ? slot !== 'jacket' : slot === 'hair'));
}
function applyExpression() {
  avatar?.expression?.setExpression(expression.value as CompleteExpression, Number(expressionStrength.value) / 100);
  avatar?.expression?.setBlink(blink.value as CompleteBlink);
  avatar?.expression?.setSecondaryMotion(hairMotion.checked);
}
expression.addEventListener('change', applyExpression);
expressionStrength.addEventListener('input', applyExpression);
blink.addEventListener('change', applyExpression);
hairMotion.addEventListener('change', applyExpression);
crouch.addEventListener('change', () => {
  document.querySelector<HTMLButtonElement>('[data-motion="run"]')!.disabled = crouch.checked;
  if (crouch.checked && motion === 'run') setMotion('walk');
});
exportImage.addEventListener('click', async () => {
  if (!avatar) return;
  const controls = Array.from(document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select'));
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  const group = activeGroup();
  group?.pause(); avatar.expression?.setPaused(true);
  exportImage.textContent = 'Rendering image…';
  try {
    // Render new pixels from the full model, rather than enlarge the viewport.
    // MSAA preserves small edges without a softening FXAA pass.
    const data = await CreateScreenshotUsingRenderTargetAsync(engine, camera, { width: 1536, height: 2048 }, 'image/png', 4, false);
    const bytes = Uint8Array.from(atob(data.split(',')[1]), char => char.charCodeAt(0));
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    imagePreview.src = imageUrl;
    imageDownload.href = imageUrl;
    imageDownload.download = `${character.value}-${currentView}-1536x2048.png`;
    document.querySelector<HTMLElement>('#image-output')!.hidden = false;
    imageDownload.focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
    status.textContent = 'Image could not render. Try again after the character finishes loading.';
  } finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    if (!paused) group?.play(true);
    avatar?.expression?.setPaused(paused);
    exportImage.textContent = 'High-resolution image';
  }
});
character.value = previewParameters.get('character') === 'female' ? 'female' : 'male';
character.addEventListener('change', () => { load().catch(reportError); }); outfit.addEventListener('change', applyOutfit);
document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach(b => b.addEventListener('click', () => setMotion(b.dataset.motion as AvatarAnimationState)));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => applyView(b.dataset.view ?? 'front')));
pause.addEventListener('click', () => { paused = !paused; const g = activeGroup(); if (paused) g?.pause(); else g?.play(true); avatar?.expression?.setPaused(paused); pause.textContent = paused ? 'Play' : 'Pause'; pause.setAttribute('aria-pressed', String(paused)); });
frame.addEventListener('input', () => { const group = activeGroup(); group?.pause(); group?.goToFrame(Number(frame.value)); avatar?.expression?.seek(Number(frame.value) / (group?.targetedAnimations[0]?.animation.framePerSecond ?? 30), motion); avatar?.expression?.setPaused(true); paused = true; pause.textContent = 'Play'; pause.setAttribute('aria-pressed', 'true'); });
function reportError(error: unknown) { console.error(error); status.textContent = 'Character could not load. Check the local asset export.'; }
scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  elapsed += dt;
  avatar?.animate(elapsed, motion, crouch.checked);
  const group = activeGroup();
  if (movingGround.checked && group?.isPlaying && motion !== 'idle') {
    // Follow-camera ground motion matches the authored stance travel. Wrapping
    // one grid spacing is seamless; the avatar/camera never reset per stride.
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 30;
    const duration = Math.max(1/fps,(group.to-group.from)/fps);
    const strideTravel = motion === 'walk' ? .40/.58 : .54/.36;
    groundGuides.position.z = (groundGuides.position.z - dt*strideTravel/duration*group.speedRatio) % .5;
  }
});
engine.runRenderLoop(() => { scene.render(); if (!paused) frame.value = String(activeGroup()?.animatables[0]?.masterFrame ?? 0); }); window.addEventListener('resize', () => engine.resize());
window.addEventListener('pagehide', () => { generation++; wardrobeControls?.dispose(); unsubscribeWardrobe?.(); if (imageUrl) URL.revokeObjectURL(imageUrl); engine.stopRenderLoop(); avatar?.dispose?.(); scene.dispose(); engine.dispose(); }, { once: true });
load().catch(reportError);
