import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

// Wayfinding signs along the central promenade. The venue's only authored
// wayfinding pylons sit at the far arrival point (runtime z ~ -291); once a
// player is on the approach there is nothing telling them where the VIP
// terrace, cascade courts, or stage are (player-flagged: "I don't know
// where the VIP doorway is"). These lit sign posts flank the promenade
// spine - which every player walks - each facing incoming players and
// naming/pointing to a destination.
//
// Runtime coordinates (verified against the live scene): promenade spine is
// walkable along x0, z -48..0; +x is the VIP/right flank, the cascade courts
// sit at x +/-40. Signs sit just outside the walk lane so they never block
// movement.

export interface WayfindingSignSpec {
  label: string;
  x: number;
  z: number;
  // Yaw the panel faces, radians about Y. 0 faces +z, PI faces -z (toward a
  // player arriving from spawn and walking toward the stage).
  faceYaw: number;
  accent: 'cyan' | 'gold';
}

// x +/-11 keeps posts just inside the crowd barriers (x +/-13) so they flank
// the walk without obstructing the central lane. A CreatePlane's front face
// normal is -z, so faceYaw ~ 0 points the readable front at players arriving
// from spawn (walking +z); a small toe rotates it toward the central lane.
// Labels carry no directional arrows: the texture is horizontally flipped to
// read correctly on the mesh face (see tryCreateLabelTexture), which would
// also reverse an arrow glyph. The sign's POSITION conveys the direction.
export const WAYFINDING_SIGNS: readonly WayfindingSignSpec[] = [
  { label: 'WELCOME', x: 11, z: -45, faceYaw: 0.3, accent: 'gold' },
  { label: 'VIP TERRACE', x: 11, z: -6, faceYaw: 0.3, accent: 'gold' },
  { label: 'CASCADE COURT', x: -11, z: -22, faceYaw: -0.3, accent: 'cyan' },
  { label: 'MAIN STAGE', x: -11, z: -38, faceYaw: -0.3, accent: 'cyan' },
];

const POST_HEIGHT = 2.5;
const PANEL_WIDTH = 3.4;
const PANEL_HEIGHT = 0.85;

export interface WayfindingSignsSummary {
  signs: number;
  panelsWithText: number;
}

export function createWayfindingSigns(scene: Scene): WayfindingSignsSummary {
  const root = new TransformNode('wayfinding-signs', scene);
  const postMaterial = new PBRMaterial('wayfinding-post-material', scene);
  postMaterial.albedoColor = new Color3(0.05, 0.06, 0.08);
  postMaterial.metallic = 0.3;
  postMaterial.roughness = 0.6;

  let panelsWithText = 0;

  WAYFINDING_SIGNS.forEach((spec, index) => {
    const post = MeshBuilder.CreateBox(
      `wayfinding-post-${index}`,
      { width: 0.18, depth: 0.18, height: POST_HEIGHT },
      scene,
    );
    post.parent = root;
    post.position.set(spec.x, POST_HEIGHT / 2, spec.z);
    post.material = postMaterial;
    post.isPickable = false;

    const panel = MeshBuilder.CreatePlane(
      `wayfinding-panel-${index}`,
      { width: PANEL_WIDTH, height: PANEL_HEIGHT },
      scene,
    );
    panel.parent = root;
    panel.position.set(spec.x, POST_HEIGHT + PANEL_HEIGHT / 2, spec.z);
    panel.rotation.y = spec.faceYaw;
    panel.isPickable = false;

    const material = new PBRMaterial(`wayfinding-panel-material-${index}`, scene);
    // Cull to the single front face (normal -z): the back face renders the
    // label mirrored, and showing both let the mirrored side win.
    material.backFaceCulling = true;
    // unlit shows albedo (verified for this venue's night dome); the label
    // texture carries its own dark-plate background and glowing text, so it
    // reads without depending on scene lights.
    material.unlit = true;
    const accent = spec.accent === 'cyan' ? new Color3(0.35, 0.85, 1) : new Color3(1, 0.82, 0.4);
    material.albedoColor = new Color3(1, 1, 1);
    material.emissiveColor = accent;
    material.emissiveIntensity = 1.1;

    const texture = tryCreateLabelTexture(scene, spec.label, spec.accent);
    if (texture) {
      material.albedoTexture = texture;
      material.emissiveTexture = texture;
      panelsWithText += 1;
    } else {
      // No 2D canvas (NullEngine tests): fall back to a solid accent plate so
      // the sign is still a visible marker.
      material.albedoColor = accent;
    }
    panel.material = material;
  });

  return { signs: WAYFINDING_SIGNS.length, panelsWithText };
}

// Draw the label onto a canvas-backed DynamicTexture: a dark rounded plate
// with a bright accent border and glowing text. Returns null where no 2D
// context is available (NullEngine) so the caller can fall back.
function tryCreateLabelTexture(scene: Scene, label: string, accent: 'cyan' | 'gold') {
  try {
    const width = 512;
    const height = 128;
    const texture = new DynamicTexture(
      `wayfinding-label-${label}`,
      { width, height },
      scene,
      false,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D | null;
    if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.fillText !== 'function') {
      return null;
    }

    const accentCss = accent === 'cyan' ? '#5ad8ff' : '#ffd066';

    // Draw the plate + label on an OFFSCREEN canvas normally, then blit it
    // horizontally flipped onto the texture with drawImage. The plane
    // presents this texture reversed on the face players read, so the flip
    // makes the label read correctly. drawImage honours the context flip
    // reliably; drawing text directly under a flipped transform (or flipping
    // baked pixels afterward) did not survive this DynamicTexture's paint
    // timing in-engine.
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const offCtx = off.getContext('2d');
    if (!offCtx || typeof offCtx.fillText !== 'function') {
      return null;
    }
    offCtx.fillStyle = 'rgba(6, 10, 16, 0.92)';
    offCtx.fillRect(0, 0, width, height);
    offCtx.strokeStyle = accentCss;
    offCtx.lineWidth = 8;
    offCtx.strokeRect(6, 6, width - 12, height - 12);
    offCtx.fillStyle = accentCss;
    offCtx.font = 'bold 62px sans-serif';
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    if ('shadowColor' in offCtx) {
      offCtx.shadowColor = accentCss;
      offCtx.shadowBlur = 18;
    }
    offCtx.fillText(label, width / 2, height / 2 + 4);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    texture.update(false);
    texture.hasAlpha = true;
    return texture;
  } catch (error) {
    console.warn('wayfinding sign: label texture unavailable', error);
    return null;
  }
}
