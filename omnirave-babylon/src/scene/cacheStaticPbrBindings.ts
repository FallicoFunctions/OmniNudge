import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import { writeMaterialUniformPacket, type MaterialUniformEntry } from './writeMaterialUniformPacket';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { BindBonesParameters, BindFogParameters, BindLights, BindLogDepth, BindMorphTargetParameters } from '@babylonjs/core/Materials/materialHelper.functions.js';
import type { Effect } from '@babylonjs/core/Materials/effect.js';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';

type InternalPbr = PBRMaterial & {
  _activeEffect: Effect;
  _afterBind(mesh: Mesh, effect: Effect, subMesh: SubMesh): void;
};

interface NativeUniforms {
  getData(): Float32Array;
  updateUniform(name: string, data: Float32Array, size: number): void;
  _uniformLocations: Record<string, number>;
  _uniformSizes: Record<string, number>;
  _uniformArraySizes: Record<string, unknown>;
  _valueCache: Record<string, unknown>;
}
interface NativePipeline { uniformBuffer: NativeUniforms }


/** Reuse fixed venue/launch material setup; mesh, lighting and scene buffers stay live. */
export function cacheStaticPbrBindings(scene: Scene): void {
  const engine = scene.getEngine();
  if (!engine.isWebGPU) return;
  const restores: (() => void)[] = [], watched = new WeakSet<PBRMaterial>();
  const stats = { reused: 0, avatarReused: 0, bound: 0 };
  scene.metadata = { ...scene.metadata, staticPbrBindings: stats };
  const avatarMaterials = scene.metadata?.avatarMaterialBindingsEnabled === true;
  const audit = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)
    && new URLSearchParams(location.search).get('staticPbrAudit') === '1';
  const audited = new WeakSet<SubMesh>();
  scene.metadata.staticPbrBindingAudit = [];
  const watch = (value: unknown) => {
    if (!(value instanceof PBRMaterial) || watched.has(value)) return;
    watched.add(value);
    const material = value as InternalPbr, original = material.bindForSubMesh;
    let ready = false, pass = -1, effect: Effect | null = null, visibility = -1, environment = -1;
    let minZ: number | undefined, maxZ: number | undefined;
    let ambientR = -1, ambientG = -1, ambientB = -1;
    let environmentTexture = scene.environmentTexture;
    let pipeline: NativePipeline | undefined;
    let uniformBuffer: NativeUniforms | undefined;
    let packet: MaterialUniformEntry[] = [];
    // A clothing material can alternate between plain, skinned and morphed
    // effects in one frame. Retain each fixed setup instead of recapturing it.
    const variants = new Map<Effect, {
      pipeline: NativePipeline | undefined; uniformBuffer: NativeUniforms | undefined;
      packet: MaterialUniformEntry[]; pass: number; visibility: number; environment: number;
      minZ: number | undefined; maxZ: number | undefined;
      ambientR: number; ambientG: number; ambientB: number; environmentTexture: typeof environmentTexture;
    }>();
    const capturedNames = new Map<string, boolean>();
    const fake = material._uniformBuffer as unknown as Record<string, unknown>;
    // Keep native invalidation, including setters that dirty submeshes directly.
    const mutable = material as unknown as Record<string, unknown>;
    for (const name of ['markAsDirty', '_markAllSubMeshesAsTexturesDirty', '_markAllSubMeshesAsLightsDirty',
      '_markAllSubMeshesAsFresnelDirty', '_markAllSubMeshesAsAttributesDirty', '_markAllSubMeshesAsMiscDirty', '_markAllSubMeshesAsAllDirty']) {
      const originalDirty = mutable[name];
      if (typeof originalDirty !== 'function') continue;
      mutable[name] = function(...args: unknown[]) { ready = false; variants.clear(); return originalDirty.apply(this, args); };
      restores.push(() => { mutable[name] = originalDirty; });
    }
    const captureUpdates = () => Object.keys(fake).flatMap(key => {
      if (!/^update/.test(key) || typeof fake[key] !== 'function') return [];
      const update = fake[key] as (...args: unknown[]) => unknown;
      fake[key] = function(...args: unknown[]) {
        if (typeof args[0] === 'string') capturedNames.set(args[0], /Matrix|Matrices/.test(key));
        return update.apply(this, args);
      };
      return [() => { fake[key] = update; }];
    });
    material.bindForSubMesh = function(world, mesh, subMesh) {
      const currentEffect = subMesh.effect, defines = subMesh.materialDefines;
      const currentPipeline = (currentEffect as unknown as { _pipelineContext?: NativePipeline })?._pipelineContext;
      const stableAvatarMaterial = avatarMaterials && mesh.metadata?.avatarPreserveMaterial === true;
      if (scene.metadata?.avatarMaterialVariantsExperiment && currentEffect !== effect) {
        if (ready && effect) {
          variants.set(effect, { pipeline, uniformBuffer, packet, pass, visibility, environment, minZ, maxZ,
            ambientR, ambientG, ambientB, environmentTexture });
          while (variants.size > 12) variants.delete(variants.keys().next().value!);
        }
        const cached = currentEffect && variants.get(currentEffect);
        if (cached) {
          ({ pipeline, uniformBuffer, packet, pass, visibility, environment, minZ, maxZ,
            ambientR, ambientG, ambientB, environmentTexture } = cached);
          effect = currentEffect;
          ready = true;
        } else ready = false;
      }
      const supported = !scene.metadata?.staticPbrBindingsBypass
        && (stableAvatarMaterial || (this.isFrozen && mesh.isWorldMatrixFrozen && !mesh.skeleton && !mesh.morphTargetManager))
        && (!mesh.bakedVertexAnimationManager || mesh.metadata?.avatarGpuInstanceProxy === true) && !this.useObjectSpaceNormalMap
        && !this.subSurface.isRefractionEnabled && !this.subSurface.isTranslucencyEnabled && !this.subSurface.isScatteringEnabled
        && !this.onBindObservable.hasObservers() && !scene.prePassRenderer?.enabled && !scene.frameGraph
        && !this.customShaderNameResolve
        && !scene.useOrderIndependentTransparency && !scene._mirroredCameraPosition
        && this.imageProcessingConfiguration === scene.imageProcessingConfiguration
        && !this.clipPlane && !this.clipPlane2 && !this.clipPlane3 && !this.clipPlane4 && !this.clipPlane5 && !this.clipPlane6
        && !scene.clipPlane && !scene.clipPlane2 && !scene.clipPlane3 && !scene.clipPlane4 && !scene.clipPlane5 && !scene.clipPlane6;
      const same = supported && currentEffect && defines && !subMesh._drawWrapper._forceRebindOnNextCall
        && currentPipeline?.uniformBuffer && currentPipeline === pipeline && currentPipeline.uniformBuffer === uniformBuffer
        && (this._uniformBuffer as unknown) === fake
        && ready && pass === engine.currentRenderPassId && effect === currentEffect
        && visibility === mesh.visibility && environment === scene.environmentIntensity && this._uniformBuffer.isSync
        && environmentTexture === scene.environmentTexture
        && ambientR === scene.ambientColor.r && ambientG === scene.ambientColor.g && ambientB === scene.ambientColor.b
        && minZ === scene.activeCamera?.minZ && maxZ === scene.activeCamera?.maxZ;
      if (same) {
        this._activeEffect = currentEffect;
        // Keep native per-mesh buffers and per-light updates. These operations
        // are independent of the shared material's texture/parameter setup.
        mesh.getMeshUniformBuffer().bindToEffect(currentEffect, 'Mesh');
        mesh.transferToEffect(world);
        this._uniformBuffer.bindToEffect(currentEffect, 'Material');
        this._uniformBuffer.bindUniformBuffer();
        // WGSL material parameters live in the effect's shared LeftOver buffer.
        // Restore only writes owned by this material, leaving lights and fog live.
        const native = currentPipeline.uniformBuffer;
        writeMaterialUniformPacket(native as unknown as UniformBuffer, packet);
        BindBonesParameters(mesh, currentEffect);
        if (defines.NUM_MORPH_INFLUENCERS) BindMorphTargetParameters(mesh, currentEffect);
        if (defines.BAKED_VERTEX_ANIMATION_TEXTURE) mesh.bakedVertexAnimationManager?.bind(currentEffect, defines.INSTANCES);
        this.bindViewProjection(currentEffect);
        this.bindEyePosition(currentEffect);
        if (scene.lightsEnabled && !this.disableLighting) BindLights(scene, mesh, currentEffect, defines, this.maxSimultaneousLights);
        this.bindView(currentEffect);
        BindFogParameters(scene, mesh, currentEffect, true);
        this.imageProcessingConfiguration.bind(currentEffect);
        BindLogDepth(defines, currentEffect, scene);
        this._afterBind(mesh, currentEffect, subMesh);
        stats.reused++;
        if (stableAvatarMaterial) stats.avatarReused++;
        if (audit && !audited.has(subMesh)) {
          audited.add(subMesh);
          const internalEngine = engine as unknown as { _currentMaterialContext: { textures: Record<string, { texture?: unknown }> } };
          const snapshot = (ubo: unknown) => {
            const buffer = ubo as { getData(): Float32Array; _uniformLocations: Record<string, number>; _uniformSizes: Record<string, number> } | undefined;
            return buffer ? Object.fromEntries(Object.entries(buffer._uniformLocations).map(([name, start]) =>
              [name, Array.from(buffer.getData().slice(start, start + buffer._uniformSizes[name]))])) : {};
          };
          const left = (currentEffect as unknown as { _pipelineContext: { uniformBuffer: unknown } })._pipelineContext.uniformBuffer;
          const before = { material: snapshot(this._uniformBuffer), leftover: snapshot(left),
            textures: Object.fromEntries(Object.entries(internalEngine._currentMaterialContext.textures).map(([key, entry]) => [key, entry.texture])) };
          subMesh._drawWrapper._forceRebindOnNextCall = true;
          original.call(this, world, mesh, subMesh);
          const after = { material: snapshot(this._uniformBuffer), leftover: snapshot(left) };
          const difference = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(b).filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(key => ({ key, before: a[key], after: b[key] }));
          const diff = { mesh: mesh.name, material: this.name, uniforms: difference(before.material, after.material),
            leftover: difference(before.leftover, after.leftover),
            textures: Object.entries(internalEngine._currentMaterialContext.textures).filter(([key, entry]) => before.textures[key] !== entry.texture).map(([key]) => key) };
          if (diff.uniforms.length || diff.leftover.length || diff.textures.length) scene.metadata.staticPbrBindingAudit.push(diff);
        }
      } else {
        capturedNames.clear();
        const restoreUpdates = supported ? captureUpdates() : [];
        if (supported) subMesh._drawWrapper._forceRebindOnNextCall = true;
        try { original.call(this, world, mesh, subMesh); } finally { restoreUpdates.forEach(restore => restore()); }
        stats.bound++;
        packet = [];
        const native = currentPipeline?.uniformBuffer;
        if (supported && native) {
          for (const [name, matrix] of capturedNames) {
            const start = native._uniformLocations[name], size = native._uniformSizes[name];
            if (start !== undefined && size) packet.push({ name, offset: start, matrix, data: native.getData().slice(start, start + size) });
          }
        }
      }
      ready = supported && packet.length > 0; pipeline = currentPipeline; pass = engine.currentRenderPassId; effect = currentEffect;
      uniformBuffer = currentPipeline?.uniformBuffer;
      visibility = mesh.visibility; environment = scene.environmentIntensity;
      environmentTexture = scene.environmentTexture;
      ambientR = scene.ambientColor.r; ambientG = scene.ambientColor.g; ambientB = scene.ambientColor.b;
      minZ = scene.activeCamera?.minZ; maxZ = scene.activeCamera?.maxZ;
    };
    restores.push(() => { material.bindForSubMesh = original; });
  };
  scene.materials.forEach(watch);
  const observer = scene.onNewMaterialAddedObservable.add(watch);
  scene.onDisposeObservable.addOnce(() => { scene.onNewMaterialAddedObservable.remove(observer); restores.forEach(restore => restore()); });
}
