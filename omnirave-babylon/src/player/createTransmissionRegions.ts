import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Geometry } from '@babylonjs/core/Meshes/geometry.js';
import type { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import type { Scene } from '@babylonjs/core/scene.js';

export interface ScreenRegion { left: number; right: number; bottom: number; top: number }
type Box = [number, number, number, number, number, number];
type Basis = NonNullable<ReturnType<import('@babylonjs/core/Morph/morphTarget.js').MorphTarget['getPositions']>>;
const empty = (): ScreenRegion => ({ left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity });

function include(region: ScreenRegion, x: number, y: number, z: number, matrix: Matrix): boolean {
  const m = matrix.m;
  const w = x * m[3] + y * m[7] + z * m[11] + m[15];
  if (w <= .00001 || !Number.isFinite(w)) return false;
  const px = (x * m[0] + y * m[4] + z * m[8] + m[12]) / w;
  const py = (x * m[1] + y * m[5] + z * m[9] + m[13]) / w;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  region.left = Math.min(region.left, px); region.right = Math.max(region.right, px);
  region.bottom = Math.min(region.bottom, py); region.top = Math.max(region.top, py);
  return true;
}

/** Bounds the shader's weighted bone transforms, including all authored morphs in [-1, 1]. */
export function createSkinnedScreenBounds() {
  const cache = new WeakMap<Geometry, { targets: Basis[]; boxes: Map<number, Box> | null }[]>();
  const bone = Matrix.Identity(), worldProjection = Matrix.Identity(), clip = Matrix.Identity();
  const build = (mesh: Mesh, targets: Basis[]): Map<number, Box> | null => {
    const positions = mesh.getVerticesData('position');
    const indices = mesh.getVerticesData('matricesIndices'), weights = mesh.getVerticesData('matricesWeights');
    const extraIndices = mesh.getVerticesData('matricesIndicesExtra'), extraWeights = mesh.getVerticesData('matricesWeightsExtra');
    if (!positions || !indices || !weights || targets.some(target => target.length !== positions.length)) return null;
    const boxes = new Map<number, Box>();
    for (let v = 0; v < positions.length / 3; v++) {
      const lo = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
      const hi = [...lo];
      for (const target of targets) for (let axis = 0; axis < 3; axis++) {
        const delta = Math.abs(target[v * 3 + axis] - positions[v * 3 + axis]);
        lo[axis] -= delta; hi[axis] += delta;
      }
      let total = 0;
      for (let i = 0; i < mesh.numBoneInfluencers; i++) {
        const weight = i < 4 ? weights[v * 4 + i] : extraWeights?.[v * 4 + i - 4];
        const joint = i < 4 ? indices[v * 4 + i] : extraIndices?.[v * 4 + i - 4];
        if (weight === undefined || !Number.isFinite(weight) || weight < 0) return null;
        total += weight;
        if (!weight) continue;
        if (joint === undefined || !Number.isInteger(joint) || joint < 0) return null;
        let box = boxes.get(joint);
        if (!box) { box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; boxes.set(joint, box); }
        for (let axis = 0; axis < 3; axis++) {
          box[axis] = Math.min(box[axis], lo[axis]); box[axis + 3] = Math.max(box[axis + 3], hi[axis]);
        }
      }
      // A convex combination of these bone boxes contains each skinned vertex.
      if (Math.abs(total - 1) > .0001) return null;
    }
    return boxes.size ? boxes : null;
  };
  return (mesh: AbstractMesh, projection: Matrix): ScreenRegion | null => {
    if (!(mesh instanceof Mesh) || !mesh.geometry || !mesh.skeleton) return null;
    const manager = mesh.morphTargetManager;
    const targets: Basis[] = [];
    for (let i = 0; i < (manager?.numTargets ?? 0); i++) {
      const target = manager!.getTarget(i);
      if (!Number.isFinite(target.influence) || Math.abs(target.influence) > 1) return null;
      const positions = target.getPositions(); if (positions) targets.push(positions);
    }
    const entries = cache.get(mesh.geometry) ?? [];
    let entry = entries.find(candidate => candidate.targets.length === targets.length
      && candidate.targets.every((target, i) => target === targets[i]));
    if (!entry) {
      entry = { targets, boxes: build(mesh, targets) }; entries.push(entry); cache.set(mesh.geometry, entries);
    }
    if (!entry.boxes) return null;
    const matrices = mesh.skeleton.getTransformMatrices(mesh);
    mesh.computeWorldMatrix().multiplyToRef(projection, worldProjection);
    const region = empty();
    for (const [joint, box] of entry.boxes) {
      if ((joint + 1) * 16 > matrices.length) return null;
      Matrix.FromArrayToRef(matrices, joint * 16, bone); bone.multiplyToRef(worldProjection, clip);
      for (let corner = 0; corner < 8; corner++) {
        if (!include(region, box[(corner & 1) ? 3 : 0], box[(corner & 2) ? 4 : 1], box[(corner & 4) ? 5 : 2], clip)) return null;
      }
    }
    return region;
  };
}

/** Only static objects entirely outside every required backdrop region are omitted. */
export function createTransmissionRegions(scene: Scene, target: RenderTargetTexture) {
  const skinnedBounds = createSkinnedScreenBounds();
  let regions: ScreenRegion[] | null = null;
  let projection = scene.getTransformMatrix();
  return {
    update() {
      regions = [];
      projection = scene.getTransformMatrix();
      const active = scene.getActiveMeshes();
      const size = target.getSize();
      if (size.width <= 0 || size.height <= 0 || !Number.isFinite(target.lodGenerationScale)
        || target.lodGenerationScale < 0 || !Number.isFinite(target.lodGenerationOffset)) { regions = null; return; }
      // At maximum roughness, lod <= log2(size) * scale + offset. Include two
      // complete texels of the next mip for trilinear sampling and mip generation.
      const maxLod = Math.max(0, Math.min(Math.log2(Math.max(size.width, size.height)),
        Math.ceil(Math.log2(size.width) * target.lodGenerationScale + target.lodGenerationOffset)));
      const marginX = (2 ** maxLod * 2 + 2) * 2 / size.width;
      const marginY = (2 ** maxLod * 2 + 2) * 2 / size.height;
      for (let i = 0; i < active.length; i++) {
        const mesh = active.data[i];
        const material = mesh.material;
        if (!(material instanceof PBRMaterial) || material.subSurface.refractionTexture !== target
          || !material.subSurface.isRefractionEnabled || !mesh.isEnabled() || !mesh.isVisible) continue;
        const surface = material.subSurface;
        // Thin glTF transmission traces straight view rays. Volumes, custom
        // filtering and unknown geometry retain the full camera background.
        if (surface.volumeIndexOfRefraction !== 1 || surface.minimumThickness !== 0 || surface.maximumThickness !== 0
          || material.realTimeFiltering || surface.isDispersionEnabled) { regions = null; return; }
        const region = skinnedBounds(mesh, projection);
        if (!region) { regions = null; return; }
        region.left -= marginX; region.right += marginX; region.bottom -= marginY; region.top += marginY;
        regions.push(region);
      }
      if (!regions.length) regions = null;
    },
    canContribute(mesh: AbstractMesh) {
      if (regions && scene.metadata?.dynamicTransmissionExperiment && mesh.skeleton) {
        const bounds = skinnedBounds(mesh, projection);
        if (!bounds) return true;
        return regions.some(region => bounds.right >= region.left && bounds.left <= region.right
          && bounds.top >= region.bottom && bounds.bottom <= region.top);
      }
      if (!regions || !mesh.isWorldMatrixFrozen || mesh.skeleton || mesh.morphTargetManager
        || mesh.infiniteDistance || mesh.billboardMode || !['PBRMaterial', 'StandardMaterial'].includes(mesh.material?.getClassName() ?? '')) return true;
      const bounds = empty();
      for (const p of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
        if (!include(bounds, p.x, p.y, p.z, projection)) return true;
      }
      return regions.some(region => bounds.right >= region.left && bounds.left <= region.right
        && bounds.top >= region.bottom && bounds.bottom <= region.top);
    },
  };
}
