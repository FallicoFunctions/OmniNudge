import { expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial.js';
import { scopeMaterialDirtyChecks } from '../scopeMaterialDirtyChecks';

it('matches native dirty callbacks while avoiding unrelated meshes, and follows reassignment', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const target = new PBRMaterial('animated', scene), other = new PBRMaterial('other', scene);
  const mesh = MeshBuilder.CreateBox('owned', {}, scene), unrelated = MeshBuilder.CreateBox('unrelated', {}, scene);
  mesh.material = target; unrelated.material = other;
  const define = new MaterialDefines();
  const draw = mesh.subMeshes[0]._drawWrapper;
  draw.defines = define; draw.materialContext = target._materialContext;
  const dirty = vi.spyOn(define, 'markAsTexturesDirty');
  const scanned = vi.spyOn(unrelated.subMeshes[0], 'getMaterial');
  target.emissiveIntensity = 2;
  expect(dirty).toHaveBeenCalledOnce(); expect(scanned).toHaveBeenCalled();
  scopeMaterialDirtyChecks(target);
  dirty.mockClear(); scanned.mockClear();
  target.emissiveIntensity = 3;
  expect(dirty).toHaveBeenCalledOnce(); expect(scanned).not.toHaveBeenCalled();
  // Clones and new direct users are added by Babylon's native material map.
  const clone = mesh.clone('clone')!;
  const cloneDefines = new MaterialDefines();
  clone.subMeshes[0]._drawWrapper.defines = cloneDefines;
  clone.subMeshes[0]._drawWrapper.materialContext = target._materialContext;
  const cloneDirty = vi.spyOn(cloneDefines, 'markAsTexturesDirty');
  mesh.material = other;
  dirty.mockClear(); cloneDirty.mockClear();
  target.emissiveIntensity = 4;
  expect(dirty).not.toHaveBeenCalled(); expect(cloneDirty).toHaveBeenCalledOnce();
  scene.dispose(); engine.dispose();
});

it.each(['multi', 'no index'])('retains the native fallback for %s users', kind => {
  const engine = new NullEngine(), scene = new Scene(engine, { useMaterialMeshMap: kind !== 'no index' });
  const target = new PBRMaterial('animated', scene);
  const mesh = MeshBuilder.CreateBox('owned', {}, scene);
  if (kind === 'multi') {
    const multi = new MultiMaterial('indirect', scene); multi.subMaterials.push(target); mesh.material = multi;
  } else mesh.material = target;
  mesh.subMeshes[0].getMaterial();
  const define = new MaterialDefines();
  mesh.subMeshes[0]._drawWrapper.defines = define;
  mesh.subMeshes[0]._drawWrapper.materialContext = target._materialContext;
  const dirty = vi.spyOn(define, 'markAsTexturesDirty');
  scopeMaterialDirtyChecks(target);
  target.emissiveIntensity = 2;
  expect(dirty).toHaveBeenCalledOnce();
  scene.blockMaterialDirtyMechanism = true;
  target.emissiveIntensity = 3;
  expect(dirty).toHaveBeenCalledOnce();
  scene.dispose(); engine.dispose();
});
