import { Animation } from '@babylonjs/core/Animations/animation.js';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton.js';
import authored from './completeAvatarLocomotion.json';

// Crowd copies share immutable tracks while Babylon owns their playback state.
const replacements = new WeakMap<Animation, Map<string, Animation>>();

/** Animation-only replacement shared by the local avatar and every crowd LOD. */
export function applyCompleteAvatarLocomotion(character: 'male' | 'female', skeleton: Skeleton, groups: readonly AnimationGroup[]) {
  const joints = new Set(skeleton.bones.map(bone => bone.getTransformNode()).filter(Boolean));
  for (const group of groups) {
    if (group.name !== 'walk' && group.name !== 'run') continue;
    const tracks: Record<string, { position: number[][]; rotationQuaternion: number[][] }> = authored[character][group.name];
    for (const targeted of group.targetedAnimations) {
      if (!joints.has(targeted.target)) continue;
      const data = tracks[targeted.target.name];
      const property = targeted.animation.targetProperty;
      if (!data || (property !== 'position' && property !== 'rotationQuaternion')) continue;
      // AssetContainer clones can share the source Animation. Never mutate it.
      const source = targeted.animation;
      const key = `${character}:${group.name}:${targeted.target.name}:${group.from}:${group.to}`;
      const cached = replacements.get(source)?.get(key);
      if (cached) { targeted.animation = cached; continue; }
      const animation = source.clone();
      const values = data[property];
      animation.setKeys(values.map((value, index) => ({
        frame: group.from + (group.to - group.from) * index / (values.length - 1),
        value: property === 'position' ? Vector3.FromArray(value) : Quaternion.FromArray(value),
      })));
      animation.loopMode = Animation.ANIMATIONLOOPMODE_CYCLE;
      let cache = replacements.get(source);
      if (!cache) { cache = new Map(); replacements.set(source, cache); }
      cache.set(key, animation);
      targeted.animation = animation;
    }
  }
}
