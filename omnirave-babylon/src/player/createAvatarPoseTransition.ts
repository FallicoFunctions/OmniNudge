import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';

const DURATION = .18;
const MOMENTUM_SECONDS = .045;

/** Blend from the last displayed pose, including interrupted transitions. */
export function createAvatarPoseTransition(skeleton: Skeleton, soleProbes: Record<string, number[][]> = {}) {
  const nodes = skeleton.bones.flatMap(bone => {
    const node = bone.getTransformNode();
    return node?.rotationQuaternion ? [{ node, previousPosition: node.position.clone(), previousRotation: node.rotationQuaternion.clone(),
      olderPosition: node.position.clone(), olderRotation: node.rotationQuaternion.clone(),
      fromPosition: node.position.clone(), fromRotation: node.rotationQuaternion.clone(),
      fromOlderPosition: node.position.clone(), fromOlderRotation: node.rotationQuaternion.clone() }] : [];
  });
  const byNode = new Map(nodes.map(pose => [pose.node, pose]));
  const root = nodes.find(pose => pose.node.name === 'Root');
  // Measure in the rig's own coordinates so moving, turning or scaling the
  // player during a transition cannot pull its feet toward an old world pose.
  const feet = ['foot_l', 'foot_r'].flatMap(name => {
    const foot = nodes.find(pose => pose.node.name === name);
    if (!root || !foot) return [];
    const chain: typeof nodes = [];
    let node: TransformNode | null = foot.node;
    while (node && node !== root.node.parent) {
      const pose = byNode.get(node);
      if (!pose) return [];
      chain.push(pose);
      node = node.parent as TransformNode | null;
    }
    return [{ chain, probes: (soleProbes[name] ?? [[0,0,0]]).map(point => Vector3.FromArray(point)), fromHeight: 0 }];
  });
  const point = Vector3.Zero();
  const local = Matrix.Identity(), transform = Matrix.Identity();
  const height = (foot: typeof feet[number], previous = false) => {
    Matrix.IdentityToRef(transform);
    for (const pose of foot.chain) {
      Matrix.ComposeToRef(pose.node.scaling, previous ? pose.previousRotation : pose.node.rotationQuaternion!,
        previous ? pose.previousPosition : pose.node.position, local);
      transform.multiplyToRef(local, transform);
    }
    let lowest = Infinity;
    for (const probe of foot.probes) {
      Vector3.TransformCoordinatesToRef(probe,transform,point);
      lowest = Math.min(lowest,point.y);
    }
    return lowest;
  };
  let recorded = false;
  let start = -Infinity;
  let previousTime = -Infinity;
  let recordedDelta = 0;
  let fromDelta = 0;
  let pending = false;
  const movingPosition = Vector3.Zero(), movingRotation = Quaternion.Identity();
  return {
    start(time: number) {
      if (!recorded || time < previousTime) { pending = false; return; }
      pending = true;
      // Stale/off-screen samples and clock rewinds provide no useful velocity.
      fromDelta = recordedDelta > .0001 && recordedDelta <= .1 && time - previousTime <= .1 ? recordedDelta : 0;
      // The cached pose belongs to the previous displayed frame. Include the
      // elapsed interval so the first frame of a new gait does not stall.
      start = fromDelta > 0 ? previousTime : time;
      for (const pose of nodes) {
        pose.fromPosition.copyFrom(pose.previousPosition);
        pose.fromRotation.copyFrom(pose.previousRotation);
        pose.fromOlderPosition.copyFrom(pose.olderPosition);
        pose.fromOlderRotation.copyFrom(pose.olderRotation);
      }
      for (const foot of feet) foot.fromHeight = height(foot, true);
    },
    // Include the completion sample, even if the review player was paused.
    active(time: number) { return pending && time >= start; },
    apply(time: number) {
      if (time < previousTime) pending = false;
      const advancing = time > previousTime;
      if (!recorded || time < previousTime) recordedDelta = 0;
      else if (advancing) recordedDelta = time - previousTime;
      previousTime = time;
      const t = pending ? Math.max(0, Math.min(1, (time - start) / DURATION)) : 1;
      if (t >= 1) pending = false;
      // Zero velocity and acceleration at either end avoids a visible hitch
      // as the shoulders and body begin to settle or rejoin the live cycle.
      const weight = t * t * t * (10 + t * (-15 + 6 * t));
      // Continue the outgoing motion briefly instead of freezing it at the
      // switch. Decay and distance/angle caps keep this a small follow-through.
      const prediction = fromDelta > 0 ? -MOMENTUM_SECONDS * Math.expm1(-t * DURATION / MOMENTUM_SECONDS) / fromDelta : 0;
      const supportHeight = t < 1 && feet.length === 2
        ? Math.min(...feet.map(foot => foot.fromHeight + (height(foot) - foot.fromHeight) * weight))
        : undefined;
      for (const pose of nodes) {
        if (advancing) {
          pose.olderPosition.copyFrom(pose.previousPosition);
          pose.olderRotation.copyFrom(pose.previousRotation);
        }
        if (t < 1) {
          const distance = Vector3.Distance(pose.fromOlderPosition,pose.fromPosition);
          const angle = 2 * Math.acos(Math.min(1,Math.abs(Quaternion.Dot(pose.fromOlderRotation,pose.fromRotation))));
          Vector3.LerpToRef(pose.fromOlderPosition,pose.fromPosition,1 + Math.min(prediction,.01 / Math.max(distance,.000001)),movingPosition);
          Quaternion.SlerpToRef(pose.fromOlderRotation,pose.fromRotation,1 + Math.min(prediction,.15 / Math.max(angle,.000001)),movingRotation);
          movingRotation.normalize();
          Vector3.LerpToRef(movingPosition, pose.node.position, weight, pose.node.position);
          Quaternion.SlerpToRef(movingRotation, pose.node.rotationQuaternion!, weight, pose.node.rotationQuaternion!);
        }
        // Capture before the crouch overlay so posture isn't applied twice.
        pose.previousPosition.copyFrom(pose.node.position);
        pose.previousRotation.copyFrom(pose.node.rotationQuaternion!);
      }
      if (supportHeight !== undefined && root) {
        // Rotation blending shortens the effective leg reach midway through
        // a start/stop. Keep the lower sole on its interpolated contact path
        // instead of letting the shoes sink and the body appear to squat.
        const blendedHeight = Math.min(...feet.map(foot => height(foot)));
        root.node.position.y += Math.max(0, supportHeight - blendedHeight);
        root.previousPosition.copyFrom(root.node.position);
      }
      recorded = true;
    },
  };
}
