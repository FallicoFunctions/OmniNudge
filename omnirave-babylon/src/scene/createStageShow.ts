import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Scene } from '@babylonjs/core/scene.js';

export interface StageShowSummary {
  screens: number;
  spillLights: number;
  ledDecks: number;
}

const BPM = 126;
const BEAT_SECONDS = 60 / BPM;

// Beat colour crossfade: venue magenta <-> cyan, matched to the hues used
// by createMainStagePresentationRig's hero-panel and LED-deck spill lights.
const MAGENTA = new Color3(0.72, 0.3, 0.85);
const CYAN = new Color3(0.16, 0.6, 0.95);

// A hard-edged beat pulse: near-zero most of the beat, spiking to 1 right on
// the downbeat and decaying fast. Cubed sine so the hit reads punchy rather
// than a smooth breathing wave.
function beatCurve(phase: number) {
  return Math.pow(Math.max(0, Math.sin(phase * Math.PI)), 3);
}

// Static LED screens and stage lighting was the venue's next "dead" tell:
// the hero panels and spill lights never changed frame to frame. This module
// drives a continuous, deterministic beat-synced show at 126 BPM across the
// hero screens, their spill lights, and the side LED decks - all found by
// name so it stays fully decoupled from whatever builds the stage meshes.
export function createStageShow(scene: Scene): StageShowSummary {
  const heroScreens = [
    scene.getMeshByName('main-stage-hero-screen-panel-l'),
    scene.getMeshByName('main-stage-hero-screen-panel-r'),
  ].filter((mesh): mesh is NonNullable<typeof mesh> => mesh != null);

  // Hero-panel spills are named '<panel>-spill' (ends with '-spill'); the
  // LED-deck spills are named 'led-deck-spill-L'/'-R' ('-spill' followed by
  // the side suffix rather than the string end). Match both shapes.
  const spillLights = scene.lights.filter(
    (light): light is PointLight => light instanceof PointLight && /-spill(-|$)/.test(light.name),
  );

  const ledDeckMeshes = [
    scene.getMeshByName('V31_SideLedTileField_L'),
    scene.getMeshByName('V31_SideLedTileField_R'),
  ].filter((mesh): mesh is NonNullable<typeof mesh> => mesh != null);

  const summary: StageShowSummary = {
    screens: heroScreens.length,
    spillLights: spillLights.length,
    ledDecks: ledDeckMeshes.length,
  };

  if (summary.screens === 0 && summary.spillLights === 0 && summary.ledDecks === 0) {
    return summary;
  }

  // --- hero screens: unfreeze + capture base state -------------------------
  const screenMaterials = heroScreens
    .map((mesh) => mesh.material)
    .filter((material): material is PBRMaterial => material instanceof PBRMaterial);
  for (const material of screenMaterials) {
    material.unfreeze?.();
  }

  // --- spill lights: unfreeze (lights have no frozen state, but their
  // materials/scene may) + capture base intensity and colours ---------------
  const spillBaseIntensity = spillLights.map((light) => light.intensity);
  const heroSpillLights = spillLights.filter((light) => light.name.startsWith('main-stage-hero-screen-panel-'));

  // --- side LED decks --------------------------------------------------
  const ledDeckMaterials = ledDeckMeshes
    .map((mesh) => ({ side: mesh.name.endsWith('_L') ? 'L' : 'R', material: mesh.material }))
    .filter(
      (entry): entry is { side: 'L' | 'R'; material: PBRMaterial } =>
        entry.material instanceof PBRMaterial && (Boolean(entry.material.emissiveTexture) || Boolean(entry.material.emissiveColor)),
    );
  for (const entry of ledDeckMaterials) {
    entry.material.unfreeze?.();
  }
  const ledDeckBaseIntensity = ledDeckMaterials.map((entry) => entry.material.emissiveIntensity);

  let elapsed = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = (scene.getEngine().getDeltaTime() || 16.7) / 1000;
    elapsed += dt;

    const beatPosition = elapsed / BEAT_SECONDS;
    const beatPhase = beatPosition % 1;
    const curve = beatCurve(beatPhase);

    // 1. hero screens: intensity pulse + slow texture drift
    for (const material of screenMaterials) {
      material.emissiveIntensity = 7.5 + 2 * curve;
      const texture = material.emissiveTexture;
      if (texture instanceof Texture) {
        texture.uOffset = (texture.uOffset + dt * 0.02) % 1;
        texture.vOffset = (texture.vOffset + dt * 0.008) % 1;
      }
    }

    // 2. spill lights: pulse intensity in sync with the beat
    for (let i = 0; i < spillLights.length; i++) {
      spillLights[i].intensity = spillBaseIntensity[i] * (0.7 + 0.5 * curve);
    }

    // every 8 beats, crossfade the hero-panel spill lights between magenta
    // and cyan over the course of one beat
    if (heroSpillLights.length > 0) {
      const cyclePosition = beatPosition % 8;
      const inCrossfadeBeat = cyclePosition >= 7;
      const mixT = inCrossfadeBeat ? cyclePosition - 7 : 0;
      // ping-pong: even 8-beat cycles fade magenta->cyan, odd cycles fade back
      const cycleIndex = Math.floor(beatPosition / 8);
      const forward = cycleIndex % 2 === 0;
      const from = forward ? MAGENTA : CYAN;
      const to = forward ? CYAN : MAGENTA;
      const mixed = Color3.Lerp(from, to, mixT);
      for (const light of heroSpillLights) {
        light.diffuse = mixed;
        light.specular = mixed;
      }
    }

    // 3. side LED decks: subtle half-beat pulse, phase-offset per side so
    // the decks answer each other (L on the beat, R on the off-beat)
    const halfBeatPhase = (beatPosition * 2) % 1;
    const rOffsetPhase = (halfBeatPhase + 0.5) % 1;
    const lCurve = beatCurve(halfBeatPhase);
    const rCurve = beatCurve(rOffsetPhase);
    for (let i = 0; i < ledDeckMaterials.length; i++) {
      const entry = ledDeckMaterials[i];
      const deckCurve = entry.side === 'L' ? lCurve : rCurve;
      entry.material.emissiveIntensity = ledDeckBaseIntensity[i] * (0.9 + 0.15 * deckCurve);
    }
  });

  return summary;
}
