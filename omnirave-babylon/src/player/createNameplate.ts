import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';

// Floating name label above a remote-player ghost. Sits at ~y 2.2 in the
// ghost's local space (the avatar capsule/head tops out around y 1.6-2.0) and
// always faces the camera via billboardMode, so it reads from any angle
// without depending on scene lights (emissive + disableLighting).

const PLATE_Y = 2.2;
const PLATE_WIDTH = 1.4;
const PLATE_HEIGHT = 0.35;
const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 64;
const MAX_NAME_LENGTH = 24;

// Names are player-controlled: strip control/formatting characters that
// could break rendering or smuggle unwanted glyphs, and cap length so a
// pathological name can't blow out the plate.
export function sanitizePlayerName(rawName: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = rawName.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (stripped.length <= MAX_NAME_LENGTH) return stripped;
  return `${stripped.slice(0, MAX_NAME_LENGTH - 1)}…`;
}

export interface Nameplate {
  mesh: Mesh;
  setName: (name: string) => void;
  dispose: () => void;
}

export function createNameplate(scene: Scene, id: string, initialName: string): Nameplate {
  const mesh = MeshBuilder.CreatePlane(
    `nameplate-${id}`,
    { width: PLATE_WIDTH, height: PLATE_HEIGHT },
    scene,
  );
  mesh.position.y = PLATE_Y;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;

  // Assign the material to the mesh BEFORE configuring lighting-affecting
  // properties: while this mesh briefly has no material, setting something
  // like disableLighting on any scene material triggers Babylon to lazily
  // instantiate a scene-wide `scene.defaultMaterial` fallback for it, which
  // then lives for the life of the scene and permanently skews every
  // materials-count leak check that follows.
  const material = new StandardMaterial(`nameplate-material-${id}`, scene);
  mesh.material = material;
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.specularColor.set(0, 0, 0);

  let texture: DynamicTexture | null = null;
  let lastName: string | null = null;

  const setName = (rawName: string) => {
    const name = sanitizePlayerName(rawName);
    if (name === lastName) return;
    lastName = name;
    texture?.dispose();
    texture = paintNameTexture(scene, id, name);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.emissiveColor.set(1, 1, 1);
    if (texture) material.opacityTexture = texture;
  };

  setName(initialName);

  const dispose = () => {
    texture?.dispose();
    material.dispose();
    mesh.dispose();
  };

  return { mesh, setName, dispose };
}

// Draw the name onto a canvas-backed DynamicTexture: a dark rounded pill
// with light text. Returns null where no 2D context is available (NullEngine
// tests) so the caller just skips assigning a texture.
function paintNameTexture(scene: Scene, id: string, name: string): DynamicTexture | null {
  try {
    const texture = new DynamicTexture(
      `nameplate-texture-${id}`,
      { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
      scene,
      false,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D | null;
    if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.fillText !== 'function') {
      texture.dispose();
      return null;
    }

    // Draw on an offscreen canvas, then blit vertically flipped onto the
    // texture - matches the flip pattern in createWayfindingSigns.ts, which
    // documents that a plane's face otherwise renders the label mirrored.
    const off = document.createElement('canvas');
    off.width = TEXTURE_WIDTH;
    off.height = TEXTURE_HEIGHT;
    const offCtx = off.getContext('2d');
    if (!offCtx || typeof offCtx.fillText !== 'function') {
      texture.dispose();
      return null;
    }

    const radius = TEXTURE_HEIGHT / 2 - 4;
    offCtx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    offCtx.fillStyle = 'rgba(8, 10, 14, 0.72)';
    roundedRect(offCtx, 4, 4, TEXTURE_WIDTH - 8, TEXTURE_HEIGHT - 8, radius);
    offCtx.fill();
    offCtx.fillStyle = '#f5f7fa';
    offCtx.font = 'bold 28px sans-serif';
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.fillText(name, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2 + 2);

    ctx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    ctx.save();
    ctx.translate(0, TEXTURE_HEIGHT);
    ctx.scale(1, -1);
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    texture.update(false);
    texture.hasAlpha = true;
    return texture;
  } catch (error) {
    console.warn('nameplate: label texture unavailable', error);
    return null;
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
