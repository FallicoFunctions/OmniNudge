import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Observer } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene';

export interface CompletionCelebration {
  active: boolean;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

interface LaunchPoint {
  x: number;
  y: number;
  z: number;
}

// The six V95 pyro nozzle arrays flanking the stage: left/right pairs at the
// approach deck, the crowd pit, and the VIP flank.
const LAUNCH_POINTS: readonly LaunchPoint[] = [
  { x: 17, y: 6.8, z: -18 },
  { x: -17, y: 6.8, z: -18 },
  { x: 17, y: 6.8, z: -2 },
  { x: -17, y: 6.8, z: -2 },
  { x: 17, y: 6.8, z: 14 },
  { x: -17, y: 6.8, z: 14 },
];

const SHELL_INTERVAL_SECONDS = 1.4;
const SHELL_PARTICLE_COUNT = 160;
const SYSTEM_CAPACITY = 220;

// Venue gold, cascade cyan, and a warm white - shells cycle through these so
// the finale doesn't read as one repeating color.
const SHELL_COLOR_PAIRS: readonly [Color4, Color4][] = [
  [new Color4(1.0, 0.72, 0.25, 1), new Color4(1.0, 0.85, 0.5, 0.9)],
  [new Color4(0.35, 0.85, 1.0, 1), new Color4(0.65, 0.95, 1.0, 0.9)],
  [new Color4(1.0, 0.96, 0.88, 1), new Color4(1.0, 1.0, 0.95, 0.85)],
];

// Objective-complete celebration: a repeating firework finale launched from
// the stage's pyro nozzle arrays. Each nozzle bursts on its own staggered
// cadence via manual particle bursts (manualEmitCount), not a continuous
// stream, so the finale reads as discrete shells rather than a fountain.
export function createCompletionCelebration(scene: Scene): CompletionCelebration {
  let systems: ParticleSystem[] = [];
  let sprite: RawTexture | null = null;
  let renderObserver: Observer<Scene> | null = null;
  let elapsedSeconds = 0;
  let shellCounter = 0;
  let nextShellAtSeconds: number[] = [];

  const armShellTimers = () => {
    elapsedSeconds = 0;
    shellCounter = 0;
    nextShellAtSeconds = systems.map(
      (_, index) => (index / systems.length) * SHELL_INTERVAL_SECONDS,
    );
  };

  const fireShell = (system: ParticleSystem) => {
    const [color1, color2] = SHELL_COLOR_PAIRS[shellCounter % SHELL_COLOR_PAIRS.length];
    system.color1 = color1;
    system.color2 = color2;
    system.manualEmitCount = SHELL_PARTICLE_COUNT;
    shellCounter += 1;
  };

  const celebration: CompletionCelebration = {
    active: false,
    start() {
      if (celebration.active) {
        return;
      }

      celebration.active = true;

      if (systems.length === 0) {
        sprite = tryCreateFireworkSprite(scene);
        systems = LAUNCH_POINTS.map((point, index) =>
          createFireworkSystem(scene, index, point, sprite),
        );
        renderObserver = scene.onBeforeRenderObservable.add(() => {
          if (!celebration.active) {
            return;
          }

          // getDeltaTime() is 0 on the very first frame (and under
          // NullEngine); fall back to a nominal 60fps step so the finale
          // never stalls.
          const dt = (scene.getEngine().getDeltaTime() || 16.7) / 1000;
          elapsedSeconds += dt;
          for (let index = 0; index < systems.length; index++) {
            if (elapsedSeconds >= nextShellAtSeconds[index]) {
              nextShellAtSeconds[index] += SHELL_INTERVAL_SECONDS;
              fireShell(systems[index]);
            }
          }
        });
      }

      armShellTimers();
    },
    stop() {
      // Halt future bursts; particles already in flight keep fading out on
      // their own lifetime.
      celebration.active = false;
    },
    dispose() {
      celebration.active = false;
      if (renderObserver) {
        // Observer.remove() (vs. Observable.remove()) unregisters
        // synchronously instead of deferring to a setTimeout, so the
        // observer is gone by the time dispose() returns.
        renderObserver.remove();
        renderObserver = null;
      }
      for (const system of systems) {
        system.dispose();
      }
      systems = [];
      sprite?.dispose();
      sprite = null;
    },
  };

  return celebration;
}

function createFireworkSystem(
  scene: Scene,
  index: number,
  point: LaunchPoint,
  sprite: RawTexture | null,
): ParticleSystem {
  const system = new ParticleSystem(`completion-firework-${index}`, SYSTEM_CAPACITY, scene);
  system.particleTexture = sprite;
  system.emitter = new Vector3(point.x, point.y, point.z);
  system.minEmitBox = new Vector3(-0.2, 0, -0.2);
  system.maxEmitBox = new Vector3(0.2, 0.2, 0.2);
  system.direction1 = new Vector3(-1, 2.6, -1);
  system.direction2 = new Vector3(1, 3.4, 1);
  system.minEmitPower = 14;
  system.maxEmitPower = 22;
  system.gravity = new Vector3(0, -9.8, 0);
  system.minLifeTime = 1.2;
  system.maxLifeTime = 2;
  system.minSize = 0.3;
  system.maxSize = 0.9;
  // Bursts only: emitRate stays 0 and manualEmitCount drives every shell.
  system.emitRate = 0;
  system.manualEmitCount = 0;
  system.blendMode = ParticleSystem.BLENDMODE_ADD;
  system.colorDead = new Color4(0, 0, 0, 0);
  system.start();
  return system;
}

// Soft radial spark sprite for the shells - a brighter, tighter core than the
// cascade court's water spray so bursts read as pyro rather than mist.
function tryCreateFireworkSprite(scene: Scene): RawTexture | null {
  let texture: RawTexture | null = null;
  try {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    const radius = size / 2;
    const inner = [255, 255, 255, 255] as const;
    const middle = [255, 235, 190, 160] as const;
    const outer = [255, 200, 120, 0] as const;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const distance = Math.min(1, Math.hypot(x - center, y - center) / radius);
        const start = distance <= 0.3 ? inner : middle;
        const end = distance <= 0.3 ? middle : outer;
        const amount = distance <= 0.3 ? distance / 0.3 : (distance - 0.3) / 0.7;
        const idx = (y * size + x) * 4;
        for (let channel = 0; channel < 4; channel++) {
          data[idx + channel] = Math.round(start[channel] + (end[channel] - start[channel]) * amount);
        }
      }
    }

    texture = RawTexture.CreateRGBATexture(
      data,
      size,
      size,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = 'completion-firework-sprite';
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  } catch (error) {
    texture?.dispose();
    console.warn('completion celebration: firework sprite unavailable', error);
    return null;
  }
}
