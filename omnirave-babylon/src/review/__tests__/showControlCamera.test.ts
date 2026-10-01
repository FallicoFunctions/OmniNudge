import { MeshBuilder, NullEngine } from '@babylonjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FollowCameraRig } from '../../player/createFollowCameraRig';
import type { PlayerRig } from '../../player/createPlayerRig';
import type { PlayerController } from '../../player/playerController';

async function setup() {
  vi.resetModules();
  document.body.innerHTML = '<div id="show-review"><canvas id="show-canvas"></canvas></div>';
  window.history.replaceState(null, '', '/show-control-review.html?world=ws://localhost/ws&wtoken=fixture');
  const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => true);
  canvas.releasePointerCapture = vi.fn();
  const engine = new NullEngine();
  vi.spyOn(engine, 'getDeltaTime').mockReturnValue(1000 / 60);
  let frame = () => {};
  vi.spyOn(engine, 'runRenderLoop').mockImplementation(callback => { frame = callback!; });
  vi.doMock('@babylonjs/core/Engines/engine.js', () => ({ Engine: class { constructor() { return engine; } } }));
  vi.doMock('@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js', () => ({
    DefaultRenderingPipeline: class { imageProcessing = {}; dispose() {} },
  }));
  vi.doMock('../../scene/createSoundBooth', () => ({ createSoundBooth: (scene: Parameters<typeof MeshBuilder.CreateGround>[2]) => ({
    meshes: [MeshBuilder.CreateGround('sound-booth-deck', { width: 2, height: 2 }, scene)], dispose: vi.fn(),
  }) }));
  vi.doMock('../../scene/createHologramGrid', () => ({ createHologramGrid: () => ({ update: vi.fn(), dispose: vi.fn() }) }));
  vi.doMock('../../scene/createMainStageCollisionBlockers', () => ({ createMainStageCollisionBlockers: () => [] }));
  vi.doMock('../../network/worldSocket', () => ({ createWorldSocket: () => ({
    onSnapshot: vi.fn(), onStatusChange: vi.fn(), connect: vi.fn(), sendMove: vi.fn(), dispose: vi.fn(),
  }) }));
  let rig!: FollowCameraRig, player!: PlayerRig, controller!: PlayerController;
  vi.doMock('../../showControl/createShowControlRuntime', () => ({ createShowControlRuntime: (options: {
    cameraRig: FollowCameraRig; playerRig: PlayerRig; playerController: PlayerController;
  }) => {
    rig = options.cameraRig; player = options.playerRig; controller = options.playerController;
    return { update: vi.fn(), unlockAudio: vi.fn(), dispose: vi.fn(), operating: false };
  } }));
  const { startShowControlReview } = await import('../showControl');
  startShowControlReview(vi.fn());
  frame();
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, { button: 0, clientX: x, clientY: 100, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    canvas.dispatchEvent(event);
  };
  return { canvas, rig, player, controller, frame: () => frame(), pointer };
}

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('show review camera controls', () => {
  it.each([false, true])('matches production rightward drag direction, operating=%s', async operating => {
    const { rig, player, controller, frame, pointer } = await setup();
    if (operating) { controller.setOperatingPosition(player.root.position.clone()); rig.setOperatorView(true); frame(); }
    const alpha = rig.camera.alpha;
    pointer('pointerdown', 100);
    pointer('pointermove', 160);
    const delta = Math.atan2(Math.sin(rig.camera.alpha - alpha), Math.cos(rig.camera.alpha - alpha));
    expect(delta).toBeLessThan(-0.17);
    pointer('pointerup', 160);
    const stopped = rig.camera.alpha;
    pointer('pointermove', 220);
    expect(rig.camera.alpha).toBeCloseTo(stopped);
    // Arrows turn the camera even while the operator's movement is locked.
    const start = player.root.position.clone();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    for (let n = 0; n < 30; n++) frame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
    expect(Math.atan2(Math.sin(rig.camera.alpha - stopped), Math.cos(rig.camera.alpha - stopped))).toBeCloseTo(Math.PI / 4, 2);
    expect(Math.hypot(player.root.position.x - start.x, player.root.position.z - start.z)).toBeLessThan(0.001);
  });

  it.each(['blur', 'lostpointercapture'])('releases manual look after %s and removes listeners on pagehide', async interruption => {
    const { rig, player, frame, pointer } = await setup();
    pointer('pointerdown', 100);
    if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
    else pointer('lostpointercapture', 100);
    const alpha = rig.camera.alpha;
    pointer('pointermove', 150);
    expect(rig.camera.alpha).toBeCloseTo(alpha);
    for (let n = 0; n < 120; n++) { player.root.position.x += 0.075; frame(); }
    expect(rig.camera.getForwardRay().direction.x).toBeGreaterThan(0.88);
    window.dispatchEvent(new Event('pagehide'));
    const look = vi.spyOn(rig, 'setManualLookActive');
    window.dispatchEvent(new Event('blur'));
    pointer('pointerdown', 100);
    pointer('pointermove', 180);
    expect(look).not.toHaveBeenCalled();
  });
});
