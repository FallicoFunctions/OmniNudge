import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { Scene } from '@babylonjs/core/scene';

// Owner request (2026-08-03): stamp "BACKSTAGE" on the hero screen's IVORY
// FOOTER trim specifically - as a deliberate easter egg, left for whoever
// wanders behind the promenade ribbon into the stage's production wing to
// find.
//
// V126_WideHeroScreenIvoryFooter is NOT a clean canvas for this: it is
// faceted architectural trim (its own front-facing vertices span z 21.43..
// 25.37, not one flat plane) with a tiled UV atlas built for a repeating
// material, not one full-surface image - verified in-engine by reading its
// own UV data, which lands in scattered small u/v ranges rather than a
// single 0..1 rectangle. Painting a DynamicTexture onto that material would
// shatter the text across dozens of tiny UV islands.
//
// Instead this mounts a flush overlay plate in front of the footer, sized
// and positioned to the footer's own measured world bounds - same "paint a
// canvas texture onto a plane" technique as createWayfindingSigns.ts, just
// scaled to a marquee instead of a trailside sign.
//
// Owner-directed placement (2026-08-04, via a marked-up screenshot): the
// label sits on the band at the FOOT OF THE MULLIONS - "as if it were posted
// onto V126_WideHeroScreenGoldMullionArray" - not down on the ivory footer
// trim where it first went. The mullions are vertical bars spanning
// y 15.18..26.02 (measured live; they carry vertices only at their capped
// ends, which is why that array's bbox covers the whole screen height), so
// the plate hangs off their base.
//
// The mesh whose PRESENCE gates this module is still the ivory footer: it is
// the reliable "is the wide hero screen assembly in this scene at all"
// sentinel, and unlike the mullions it is a single unmerged mesh.
const FOOTER_MESH_NAME = 'V126_WideHeroScreenIvoryFooter';
const LABEL = 'BACKSTAGE';

const PLATE_WIDTH = 38.5;
const PLATE_HEIGHT = 1.5;
// Bottom edge parked on the mullions' own measured base (y 15.18), so the
// label reads as posted onto the foot of that array rather than floating in
// the screen's middle.
const PLATE_CENTER_Y = 15.95;
// Depth stays in front of the ENTIRE screen assembly, not tucked back onto
// the mullion face: the mullions front at z 21.71 but the gold frame's side
// members front at z 21.31, and this plate is wider (x +/-19.25) than the
// mullion run (x +/-11.7) - mounting flush to the mullions would let those
// outer frame members cut across the label's ends. 21.15 clears all of it
// while staying close enough not to read as floating.
const PLATE_Z = 21.15;

export interface BackstageEasterEggSummary {
  applied: boolean;
}

export function createBackstageEasterEgg(scene: Scene): BackstageEasterEggSummary {
  if (scene.getMeshByName(FOOTER_MESH_NAME) == null) {
    // Footer trim not present in this scene (stripped test/mock scenes):
    // nothing to mount the plate against.
    return { applied: false };
  }

  const plate = MeshBuilder.CreatePlane(
    'backstage-easter-egg-plate',
    { width: PLATE_WIDTH, height: PLATE_HEIGHT },
    scene,
  );
  plate.position.set(0, PLATE_CENTER_Y, PLATE_Z);
  plate.isPickable = false;
  // Cull to the single front face (normal -z, matching CreatePlane's default
  // and the footer's own outward-facing side): the back face would render
  // the label mirrored into the stage's rear shell, where nobody stands.
  plate.material = createLabelMaterial(scene);

  return { applied: true };
}

function createLabelMaterial(scene: Scene): PBRMaterial {
  const material = new PBRMaterial('backstage-easter-egg-material', scene);
  material.backFaceCulling = true;
  // unlit + emissive-driven, matching createWayfindingSigns.ts: reads
  // consistently regardless of the venue's night-time scene lighting.
  material.unlit = true;
  material.albedoColor = new Color3(1, 1, 1);
  material.emissiveColor = new Color3(1, 0.86, 0.5);
  material.emissiveIntensity = 1.15;

  const texture = tryCreateLabelTexture(scene);
  if (texture) {
    material.albedoTexture = texture;
    material.emissiveTexture = texture;
  } else {
    // No 2D canvas (NullEngine tests): fall back to a solid gold plate so
    // the mesh count/material assignment is still exercised.
    material.albedoColor = new Color3(1, 0.86, 0.5);
  }
  return material;
}

// Same offscreen-canvas-then-flip technique as createWayfindingSigns.ts's
// tryCreateLabelTexture: this DynamicTexture presents the player-facing side
// rotated 180 degrees (both axes reversed) in-engine, so text drawn directly
// reads upside-down and mirrored. Drawing to an offscreen canvas normally,
// then blitting it vertically-flipped via drawImage, is the fix verified to
// survive this texture's paint timing - flipping baked pixels afterward or
// drawing under a flipped transform did not.
function tryCreateLabelTexture(scene: Scene) {
  try {
    const width = 2048;
    const height = 128;
    const texture = new DynamicTexture(
      'backstage-easter-egg-label',
      { width, height },
      scene,
      false,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D | null;
    if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.fillText !== 'function') {
      return null;
    }

    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const offCtx = off.getContext('2d');
    if (!offCtx || typeof offCtx.fillText !== 'function') {
      return null;
    }
    offCtx.fillStyle = 'rgba(4, 5, 8, 0.95)';
    offCtx.fillRect(0, 0, width, height);
    offCtx.strokeStyle = '#ffd97a';
    offCtx.lineWidth = 6;
    offCtx.strokeRect(4, 4, width - 8, height - 8);
    offCtx.fillStyle = '#ffd97a';
    offCtx.font = 'bold 84px sans-serif';
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    if ('shadowColor' in offCtx) {
      offCtx.shadowColor = '#ffd97a';
      offCtx.shadowBlur = 22;
    }
    // Wide letter-spacing so nine capital letters fill a 2048x128 marquee
    // strip instead of sitting cramped in the middle.
    const letters = LABEL.split('');
    const totalWidth = letters.reduce((sum, ch) => sum + offCtx.measureText(ch).width, 0);
    const spacing = 34;
    const drawWidth = totalWidth + spacing * (letters.length - 1);
    let x = width / 2 - drawWidth / 2;
    for (const ch of letters) {
      const w = offCtx.measureText(ch).width;
      offCtx.fillText(ch, x + w / 2, height / 2 + 4);
      x += w + spacing;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(0, height);
    ctx.scale(1, -1);
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    texture.update(false);
    texture.hasAlpha = true;
    return texture;
  } catch (error) {
    console.warn('backstage easter egg: label texture unavailable', error);
    return null;
  }
}
