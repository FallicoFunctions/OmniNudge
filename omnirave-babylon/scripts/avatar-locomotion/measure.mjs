import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine, Quaternion, Scene, Vector3 } from '@babylonjs/core/index.js';
import { readRig } from './readRig.mjs';

/** Inspect the motion envelope without textures or a rendering loop. */
export function measureMotion(rig, state) {
  const position = name => { const node = rig.joint(name); node.computeWorldMatrix(true); return node.getAbsolutePosition().clone(); };
  rig.sample('idle',0);
  const standingHip = position('pelvis').y;
  const result = { hipDrop: 0, upperArmDegrees: 0, forearmDown: 1, thighDegrees: 0,
    straighterKneeDegrees: 0, footMinZ: Infinity, footMaxZ: -Infinity, footMaxY: 0,
    kneeStepDegrees: 0, kneeAccelerationDegrees: 0, hipStep: 0, hipAcceleration: 0,
    handMinForward: Infinity, handMaxForward: -Infinity, forearmOutward: -Infinity, wristBendDegrees: 0, fingerMotionDegrees: 0 };
  const knees = [[],[]], hips = [];
  const fingerRotations = new Map();
  for (let i = 0; i < 64; i++) {
    rig.sample(state,i/64);
    result.hipDrop = Math.max(result.hipDrop,standingHip-position('pelvis').y);
    hips.push(position('pelvis').y);
    let straighterKnee = Infinity;
    for (const side of ['l','r']) {
      const thigh = position(`calf_${side}`).subtract(position(`thigh_${side}`)).normalize();
      const shin = position(`foot_${side}`).subtract(position(`calf_${side}`)).normalize();
      const upperArm = position(`lowerarm_${side}`).subtract(position(`upperarm_${side}`)).normalize();
      const forearm = position(`hand_${side}`).subtract(position(`lowerarm_${side}`)).normalize();
      const hand = position(`hand_${side}`), elbow = position(`lowerarm_${side}`), shoulder = position(`upperarm_${side}`);
      const handDirection = position(`middle_01_${side}`).subtract(hand).normalize();
      result.handMinForward = Math.min(result.handMinForward,hand.z-shoulder.z);
      result.handMaxForward = Math.max(result.handMaxForward,hand.z-shoulder.z);
      result.forearmOutward = Math.max(result.forearmOutward,(side === 'l' ? -1 : 1)*(hand.x-elbow.x));
      result.wristBendDegrees = Math.max(result.wristBendDegrees,Math.acos(Math.min(1,Vector3.Dot(forearm,handDirection)))*180/Math.PI);
      for (const finger of ['index','middle','ring','pinky','thumb']) for (const segment of [1,2,3]) {
        const name = `${finger}_0${segment}_${side}`, rotation = rig.joint(name).rotationQuaternion;
        if (!fingerRotations.has(name)) fingerRotations.set(name,rotation.clone());
        result.fingerMotionDegrees = Math.max(result.fingerMotionDegrees,2*Math.acos(Math.min(1,Math.abs(Quaternion.Dot(rotation,fingerRotations.get(name)))))*180/Math.PI);
      }
      const foot = position(`foot_${side}`);
      result.upperArmDegrees = Math.max(result.upperArmDegrees, Math.abs(Math.atan2(upperArm.z,-upperArm.y))*180/Math.PI);
      result.forearmDown = Math.min(result.forearmDown,-forearm.y);
      result.thighDegrees = Math.max(result.thighDegrees,Math.abs(Math.atan2(thigh.z,-thigh.y))*180/Math.PI);
      const knee = Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(thigh,shin))))*180/Math.PI;
      straighterKnee = Math.min(straighterKnee,knee);
      knees[side === 'l' ? 0 : 1].push(knee);
      result.footMinZ = Math.min(result.footMinZ,foot.z);
      result.footMaxZ = Math.max(result.footMaxZ,foot.z);
      result.footMaxY = Math.max(result.footMaxY,foot.y);
    }
    result.straighterKneeDegrees = Math.max(result.straighterKneeDegrees,straighterKnee);
  }
  for (let i = 0; i < 64; i++) {
    const before = (i+63)%64, after = (i+1)%64;
    result.hipStep = Math.max(result.hipStep,Math.abs(hips[after]-hips[i]));
    result.hipAcceleration = Math.max(result.hipAcceleration,Math.abs(hips[after]-2*hips[i]+hips[before]));
    for (const knee of knees) {
      result.kneeStepDegrees = Math.max(result.kneeStepDegrees,Math.abs(knee[after]-knee[i]));
      result.kneeAccelerationDegrees = Math.max(result.kneeAccelerationDegrees,Math.abs(knee[after]-2*knee[i]+knee[before]));
    }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const project = new URL('../../',import.meta.url);
  const data = JSON.parse(readFileSync(process.argv[2] ?? new URL('src/player/completeAvatarLocomotion.json',project),'utf8'));
  const engine = new NullEngine();
  const report = {};
  for (const sex of ['male','female']) {
    const scene = new Scene(engine);
    const rig = readRig(scene,fileURLToPath(new URL(`public/assets/avatars/complete-pair/${sex}.glb`,project)));
    for (const group of rig.groups) if (data[sex][group.name]) {
      for (const track of group.targetedAnimations) {
        const property = track.animation.targetProperty;
        const values = data[sex][group.name][track.target.name]?.[property];
        if (!values) continue;
        track.animation.setKeys(values.map((value,index) => ({ frame: group.from+(group.to-group.from)*index/(values.length-1),
          value: property === 'position' ? Vector3.FromArray(value) : Quaternion.FromArray(value) })));
      }
    }
    report[sex] = Object.fromEntries(['walk','run'].map(state => [state,measureMotion(rig,state)]));
    scene.dispose();
  }
  engine.dispose();
  console.log(JSON.stringify(report,null,2));
}
