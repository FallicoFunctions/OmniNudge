import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** The pose texture stores live matrices, with one fixed row per player. */
export class AvatarInstancePosePlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial, name = 'AvatarInstancePose') {
    super(material, name, 190, {}, true, true);
    this.doNotSerialize = true;
  }
  override getClassName() { return 'AvatarInstancePosePlugin'; }
  override isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.WGSL; }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'vertex') return null;
    return {
      '!let totalFrames: f32=[\\s\\S]*?var VATInfluence\\s*:\\s*mat4x4<f32>;':
        'let VATFrameNum: f32=VATStartFrame;var VATInfluence: mat4x4<f32>;',
    };
  }
}

/** Experimental draw uses every target layer and four per-instance influences. */
export class AvatarInstanceMorphPlugin extends AvatarInstancePosePlugin {
  constructor(material: PBRMaterial) { super(material, 'AvatarInstanceMorphs'); }
  override getClassName() { return 'AvatarInstanceMorphPlugin'; }
  override getAttributes(attributes: string[]) { attributes.push('avatarMorphInfluences'); }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type !== 'vertex') return null;
    return {
      ...super.getCustomCode(type),
      CUSTOM_VERTEX_DEFINITIONS: 'attribute avatarMorphInfluences: vec4<f32>;',
      // Babylon adds a newline after injected code and drops standalone
      // semicolons. Keep an assignment's delimiter on its expression line.
      '!uniforms\\.morphTargetInfluences\\[i\\](;?)': 'vertexInputs.avatarMorphInfluences[i]$1',
      '!i32\\(uniforms\\.morphTargetTextureIndices\\[targetIndex\\]\\)': 'targetIndex',
      '!if\\s*\\(f32\\(i\\)>=uniforms\\.morphTargetCount\\)\\s*\\{break;\\}':
        'if (vertexInputs.avatarMorphInfluences[i]==0.0) {continue;}',
    };
  }
}

const targetArrays = (manager: MorphTargetManager) => Array.from({ length: manager.numTargets }, (_, i) => {
  const target = manager.getTarget(i);
  return [target.getPositions(), target.getNormals(), target.getTangents(), target.getUVs(), target.getUV2s(), target.getColors()];
});

export function createAvatarInstanceMorphs(scene: Scene, source: MorphTargetManager) {
  if (!source.isUsingTextureForTargets || source.numTargets < 1 || source.numTargets > 4
    || MorphTargetManager.ConstantTargetCountForTextureMode > source.numTargets) return null;
  const arrays = targetArrays(source);
  const manager = new MorphTargetManager(scene);
  try {
    manager.areUpdatesFrozen = true;
    for (let i = 0; i < source.numTargets; i++) {
      const target = source.getTarget(i).clone(); target.influence = 1;
      manager.addTarget(target);
    }
    manager.numMaxInfluencers = source.numTargets;
    manager.enablePositionMorphing = source.enablePositionMorphing;
    manager.enableNormalMorphing = source.enableNormalMorphing;
    manager.enableTangentMorphing = source.enableTangentMorphing;
    manager.enableUVMorphing = source.enableUVMorphing;
    manager.enableUV2Morphing = source.enableUV2Morphing;
    manager.enableColorMorphing = source.enableColorMorphing;
    manager.areUpdatesFrozen = false;
  } catch (error) {
    manager.dispose();
    throw error;
  }
  return {
    manager,
    matches(candidate: MorphTargetManager) {
      if (!candidate.isUsingTextureForTargets || candidate.numTargets !== arrays.length
        || candidate.enablePositionMorphing !== manager.enablePositionMorphing
        || candidate.enableNormalMorphing !== manager.enableNormalMorphing
        || candidate.enableTangentMorphing !== manager.enableTangentMorphing
        || candidate.enableUVMorphing !== manager.enableUVMorphing
        || candidate.enableUV2Morphing !== manager.enableUV2Morphing
        || candidate.enableColorMorphing !== manager.enableColorMorphing) return false;
      for (let i = 0; i < arrays.length; i++) {
        const target = candidate.getTarget(i), row = arrays[i];
        if (!Number.isFinite(target.influence) || target.getPositions() !== row[0] || target.getNormals() !== row[1]
          || target.getTangents() !== row[2] || target.getUVs() !== row[3] || target.getUV2s() !== row[4]
          || target.getColors() !== row[5]) return false;
      }
      return true;
    },
    write(candidate: MorphTargetManager, buffer: Float32Array, offset: number) {
      let changed = false;
      for (let i = 0; i < 4; i++) {
        const value = Math.fround(i < arrays.length ? candidate.getTarget(i).influence : 0);
        changed ||= buffer[offset + i] !== value;
        buffer[offset + i] = value;
      }
      return changed;
    },
    dispose() { manager.dispose(); },
  };
}
