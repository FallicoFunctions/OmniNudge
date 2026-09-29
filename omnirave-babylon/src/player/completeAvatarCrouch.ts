import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CROUCH_HEIGHT_SCALE, REFERENCE_EYE_HEIGHT_METERS } from './playerPresence';

const TRANSITION_SECONDS = .22;

/** An interruptible, elapsed-time transition. New copies adopt their current posture. */
export function createCrouchTransition() {
  let initialized = false;
  let start = 0;
  let from = 0;
  let target = 0;
  let previousTime = 0;
  const sample = (time: number) => {
    if (time - start >= TRANSITION_SECONDS - 1e-9) return target;
    const t = Math.max(0, Math.min(1, (time - start) / TRANSITION_SECONDS));
    return from + (target - from) * t * t * (3 - 2 * t);
  };
  return (elapsed: number, crouched: boolean) => {
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : previousTime;
    const next = crouched ? 1 : 0;
    if (!initialized || time < previousTime) {
      from = target = next; start = time; initialized = true;
    } else if (next !== target) {
      from = sample(time); target = next; start = time;
    }
    previousTime = time;
    return sample(time);
  };
}

/**
 * Pose the existing joint nodes after the authored clip has been sampled.
 * Two-bone leg IK retains ankle position and foot orientation; no bone scale,
 * bind pose, geometry, material, wardrobe state or garment morph is changed.
 */
export function createCompleteAvatarCrouch(skeleton: Skeleton, avatarRoot: TransformNode) {
  const joint = (name: string) => skeleton.bones.find(bone => bone.name === name)?.getTransformNode();
  const root = joint('Root');
  const spine = joint('spine_01');
  const neck = joint('neck_01');
  const legs = ['l', 'r'].map(side => ({ thigh: joint(`thigh_${side}`), calf: joint(`calf_${side}`), foot: joint(`foot_${side}`) }));
  // Synthetic/older rigs retain their existing animation fallback.
  if (!root || !spine || !neck || legs.some(leg => !leg.thigh || !leg.calf || !leg.foot)) return () => {};

  const inverseParent = Matrix.Identity();
  const position = (node: TransformNode) => { node.computeWorldMatrix(true); return node.getAbsolutePosition().clone(); };
  const toParentDirection = (node: TransformNode, direction: Vector3) => {
    if (!node.parent) return direction.clone();
    node.parent.computeWorldMatrix(true).invertToRef(inverseParent);
    return Vector3.TransformNormal(direction, inverseParent);
  };
  const rotateToward = (node: TransformNode, child: TransformNode, goal: Vector3) => {
    const origin = position(node);
    const current = toParentDirection(node, position(child).subtract(origin)).normalize();
    const desired = toParentDirection(node, goal.subtract(origin)).normalize();
    const turn = Quaternion.FromUnitVectorsToRef(current, desired, new Quaternion());
    node.rotationQuaternion = turn.multiply(node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation));
    node.computeWorldMatrix(true);
  };
  const rotateInWorld = (node: TransformNode, axis: Vector3, angle: number) => {
    const localAxis = toParentDirection(node, axis).normalize();
    // An axial vector changes handedness through glTF's mirrored parent.
    const handedness = node.parent && node.parent.getWorldMatrix().determinant() < 0 ? -1 : 1;
    const turn = Quaternion.RotationAxis(localAxis, angle * handedness);
    node.rotationQuaternion = turn.multiply(node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation));
    node.computeWorldMatrix(true);
  };
  return (amount: number) => {
    if (!(amount > 0)) return;
    const blend = Math.min(1, amount);
    const avatarWorld = avatarRoot.computeWorldMatrix(true);
    const up = Vector3.TransformNormal(Vector3.Up(), avatarWorld).normalize();
    const forward = Vector3.TransformNormal(Vector3.Forward(), avatarWorld).normalize();
    const right = Vector3.Cross(up, forward).normalize();
    const planted = legs.map(leg => {
      const thigh = leg.thigh!, calf = leg.calf!, foot = leg.foot!;
      const hip = position(thigh), knee = position(calf), ankle = position(foot);
      return { thigh, calf, foot, ankle, footWorld: foot.getWorldMatrix().clone(),
        upperLength: Vector3.Distance(hip, knee), lowerLength: Vector3.Distance(knee, ankle) };
    });
    const lowering = REFERENCE_EYE_HEIGHT_METERS * (1 - CROUCH_HEIGHT_SCALE) * blend;
    root.position.addInPlace(toParentDirection(root, up.scale(-lowering).add(forward.scale(-.065 * blend))));
    root.computeWorldMatrix(true);
    rotateInWorld(spine, right, .20 * blend);
    rotateInWorld(neck, right, -.10 * blend);
    for (const leg of planted) {
      const hip = position(leg.thigh);
      const delta = leg.ankle.subtract(hip);
      const direction = delta.normalizeToNew();
      const distance = Math.max(.001, Math.min(delta.length(), leg.upperLength + leg.lowerLength - .00001));
      const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + distance ** 2) / (2 * distance);
      const bend = forward.subtract(direction.scale(Vector3.Dot(forward, direction))).normalize();
      const knee = hip.add(direction.scale(along))
        .add(bend.scale(Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2))));
      rotateToward(leg.thigh, leg.calf, knee);
      rotateToward(leg.calf, leg.foot, leg.ankle);
      // Keep the source clip's sole orientation after solving both leg joints.
      leg.foot.parent!.computeWorldMatrix(true).invertToRef(inverseParent);
      const localFoot = leg.footWorld.multiply(inverseParent);
      const rotation = new Quaternion();
      localFoot.decompose(undefined, rotation, undefined);
      leg.foot.rotationQuaternion = rotation;
      leg.foot.computeWorldMatrix(true);
    }
  };
}
