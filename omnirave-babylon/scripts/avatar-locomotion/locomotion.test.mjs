import { afterEach, beforeEach, expect, it } from 'vitest';
import { NullEngine, Quaternion, Scene, Vector3 } from '@babylonjs/core/index.js';
import { readRig } from './readRig.mjs';
import { measureMotion } from './measure.mjs';
import { applyCompleteAvatarLocomotion } from '../../src/player/completeAvatarLocomotion';
import { createAvatarPoseTransition } from '../../src/player/createAvatarPoseTransition';
import { createCompleteAvatarCrouch } from '../../src/player/completeAvatarCrouch';
import { createCompleteAvatarFromAssets } from '../../src/player/createCompleteAvatar';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import soleProbes from '../../src/player/completeAvatarSoleProbes.json';

let engine, scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });
const load = file => readRig(scene, `public/assets/avatars/complete-pair/${file}`);
const pos = node => { node.computeWorldMatrix(true); return node.getAbsolutePosition().clone(); };

it('shares authored tracks between crowd copies while their sampled poses stay independent', () => {
  const a = load('male.glb'), b = load('male.glb');
  for (const group of b.groups) {
    const source = a.groups.find(candidate => candidate.name === group.name);
    group.targetedAnimations.forEach((target,index) => { target.animation = source.targetedAnimations[index].animation; });
  }
  applyCompleteAvatarLocomotion('male',a.skeleton,a.groups);
  applyCompleteAvatarLocomotion('male',b.skeleton,b.groups);
  for (const group of b.groups) {
    const source = a.groups.find(candidate => candidate.name === group.name);
    group.targetedAnimations.forEach((target,index) => expect(target.animation).toBe(source.targetedAnimations[index].animation));
  }
  a.sample('run',.1); const before = pos(a.joint('foot_l'));
  b.sample('run',.6);
  expect(Vector3.Distance(pos(a.joint('foot_l')),before)).toBeLessThan(.000001);
  expect(Vector3.Distance(pos(b.joint('foot_l')),before)).toBeGreaterThan(.1);
});

it.each(['male.glb','male-lod1.glb','male-lod2.glb','female.glb','female-lod1.glb','female-lod2.glb'])(
  'retains ground contact, swing clearance, opposing arms and a seamless loop on %s', file => {
    const rig = load(file);
    const originals = rig.groups.flatMap(group => group.targetedAnimations.map(target => [target.animation, target.animation.getKeys()]));
    applyCompleteAvatarLocomotion(file.startsWith('female') ? 'female' : 'male', rig.skeleton, rig.groups);
    // A copy must not rewrite shared source animations for another player.
    for (const [animation, keys] of originals) expect(animation.getKeys()).toBe(keys);
    for (const state of ['walk','run']) {
      rig.sample(state,0);
      const start = rig.skeleton.bones.map(bone => ({ p: pos(bone.getTransformNode()), q: bone.getTransformNode().rotationQuaternion.clone() }));
      rig.sample(state,1);
      rig.skeleton.bones.forEach((bone,i) => {
        expect(Vector3.Distance(pos(bone.getTransformNode()),start[i].p)).toBeLessThan(.00001);
        expect(Math.abs(Quaternion.Dot(bone.getTransformNode().rotationQuaternion,start[i].q))).toBeCloseTo(1,5);
      });
      for (const phase of Array.from({length:64},(_,index) => index/64)) {
        rig.sample(state,phase);
        const floor = rig.shoePoints().reduce((min,p) => Math.min(min,p.y),Infinity);
        expect(floor, `${state} ${phase} sole`).toBeGreaterThan(-.004);
        if (state === 'walk' || phase % .5 < .36) expect(floor).toBeLessThan(.004);
      }
      rig.sample(state,0);
      const front = pos(rig.joint('foot_l')).z;
      rig.sample(state,state === 'run' ? .30 : .55);
      expect(front-pos(rig.joint('foot_l')).z).toBeGreaterThan(state === 'run' ? .4 : .3);
      rig.sample(state,0);
      const armL = pos(rig.joint('lowerarm_l')).z-pos(rig.joint('upperarm_l')).z;
      const armR = pos(rig.joint('lowerarm_r')).z-pos(rig.joint('upperarm_r')).z;
      expect(armL).toBeLessThan(-.04); expect(armR).toBeGreaterThan(.04);
      const motion = measureMotion(rig,state);
      // Check the user's actual failure modes, not just grounded shoe soles:
      // hips stay up, a support leg extends, forearms hang down, and the whole
      // cycle stays within a restrained range rather than a high-knee march.
      expect(motion.hipDrop).toBeLessThan(state === 'walk' ? .025 : .05);
      expect(motion.straighterKneeDegrees).toBeLessThan(state === 'walk' ? 23 : 38);
      expect(motion.upperArmDegrees).toBeLessThan(state === 'walk' ? 12 : 20);
      expect(motion.forearmDown).toBeGreaterThan(state === 'walk' ? .92 : .47);
      expect(motion.thighDegrees).toBeLessThan(state === 'walk' ? 27 : 40);
      expect(motion.footMaxY).toBeLessThan(state === 'walk' ? .16 : .27);
      expect(motion.footMaxZ-motion.footMinZ).toBeLessThan(state === 'walk' ? .46 : .67);
      expect(motion.kneeStepDegrees).toBeLessThan(state === 'walk' ? 3.1 : 8.5);
      expect(motion.kneeAccelerationDegrees).toBeLessThan(state === 'walk' ? 2 : 4);
      expect(motion.hipAcceleration).toBeLessThan(.0022);
      if (state === 'run') {
        // Hands pass beside the hips, with tucked-in forearms and neutral
        // wrists, instead of being held forward in an open-palmed tray pose.
        expect(motion.handMinForward).toBeLessThan(-.01);
        expect(motion.handMaxForward).toBeLessThan(.32);
        expect(motion.forearmOutward).toBeLessThan(0);
        expect(motion.wristBendDegrees).toBeLessThan(3);
        expect(motion.fingerMotionDegrees).toBeLessThan(.1);
      } else {
        expect(motion.forearmOutward).toBeLessThan(.015);
        expect(motion.wristBendDegrees).toBeLessThan(3);
      }
    }
    rig.sample('run',.52);
    const ankle = pos(rig.joint('foot_l')), knee = pos(rig.joint('calf_l'));
    expect(ankle.y).toBeGreaterThan(.17);
    expect(knee.z-ankle.z).toBeGreaterThan(.15);
    rig.sample('walk',.125);
    const avatarRoot = new TransformNode('avatar-root',scene); rig.root.parent = avatarRoot;
    const before = ['l','r'].map(side => pos(rig.joint(`foot_${side}`)));
    createCompleteAvatarCrouch(rig.skeleton,avatarRoot)(1);
    for (const [i,side] of ['l','r'].entries()) expect(Vector3.Distance(pos(rig.joint(`foot_${side}`)),before[i])).toBeLessThan(.0001);
  });

it.each(['male','female'])('moves the %s walking weight toward the supporting foot', sex => {
  const rig = load(`${sex}-lod2.glb`);
  applyCompleteAvatarLocomotion(sex,rig.skeleton,rig.groups);
  for (const [phase,direction] of [[.25,-1],[.75,1]]) {
    rig.sample('walk',phase);
    const feetCenter = (pos(rig.joint('foot_l')).x+pos(rig.joint('foot_r')).x)/2;
    const shift = (pos(rig.joint('pelvis')).x-feetCenter)*direction;
    expect(shift).toBeGreaterThan(.01);
    expect(shift).toBeLessThan(.025);
  }
  rig.sample('walk',0);
  const hips = pos(rig.joint('thigh_r')).subtract(pos(rig.joint('thigh_l')));
  const shoulders = pos(rig.joint('upperarm_r')).subtract(pos(rig.joint('upperarm_l')));
  expect(hips.z*shoulders.z).toBeLessThan(0);
});

it.each(['male.glb','male-lod1.glb','male-lod2.glb','female.glb','female-lod1.glb','female-lod2.glb'])(
  'rolls through each walking landing without holding the trailing shoe on %s', file => {
  const rig = load(file);
  applyCompleteAvatarLocomotion(file.startsWith('female') ? 'female' : 'male',rig.skeleton,rig.groups);
  for (const contact of [0,.5]) {
    const leadingSide = contact === 0 ? -1 : 1;
    for (const elapsedPhase of [0,.025,.05,.075,.10,.125]) {
      rig.sample('walk',contact+elapsedPhase);
      const shoes = rig.shoePoints();
      const leading = shoes.filter(point => point.x*leadingSide > 0);
      const trailing = shoes.filter(point => point.x*leadingSide < 0);
      const floor = Math.min(...leading.map(point => point.y));
      // The new support shoe must actually land. Grounding only the lowest
      // shoe hid a 1 cm hover here while the rear toe delayed the next step.
      expect(Math.abs(floor),`support at ${contact+elapsedPhase}`).toBeLessThan(.002);
      if (elapsedPhase === 0) {
        const rear = Math.min(...trailing.map(point => point.z));
        const heel = trailing.filter(point => point.z < rear+.035);
        expect(Math.min(...heel.map(point => point.y))).toBeGreaterThan(.03);
      }
      if (elapsedPhase === .125) {
        // Within 133 ms of landing, the entire trailing sole is in recovery.
        expect(Math.min(...trailing.map(point => point.y))).toBeGreaterThan(.004);
      }
    }
  }
});

it('preserves the live leading-foot phase through gait changes and a real sampled avatar replacement', () => {
  const anchor = new TransformNode('player-anchor',scene);
  const make = () => {
    const rig = load('female.glb');
    const avatar = createCompleteAvatarFromAssets(scene,'female',{
      meshes:[],transformNodes:[rig.root,...rig.nodes],skeletons:[rig.skeleton],animationGroups:rig.groups,
    },{sampledAnimationRate:60,persistWardrobe:false});
    avatar.root.parent = anchor;
    return avatar;
  };
  const a = make();
  const group = (avatar,state) => avatar.animationGroups.find(clip => clip.name === state);
  const phase = clip => (clip.getCurrentFrame()-clip.from)/(clip.to-clip.from);
  a.animate(.3,'walk');
  const before = phase(group(a,'walk'));
  a.animate(.3,'run');
  expect(phase(group(a,'run'))).toBeCloseTo(before,6);
  a.animate(.4,'run');
  const b = make(); b.animate(.4,'run');
  expect(phase(group(b,'run'))).toBeCloseTo(phase(group(a,'run')),6);
  a.release(); b.release();
});

it('starts from the displayed pose and blends consistently across frame rates and interruptions', () => {
  const rig = load('female.glb');
  applyCompleteAvatarLocomotion('female',rig.skeleton,rig.groups);
  rig.sample('idle',0);
  const transition = createAvatarPoseTransition(rig.skeleton);
  transition.apply(0);
  const hip = rig.joint('pelvis'), before = hip.rotationQuaternion.clone();
  transition.start(1); rig.sample('run',.25); transition.apply(1);
  expect(Math.abs(Quaternion.Dot(before,hip.rotationQuaternion))).toBeCloseTo(1,6);
  rig.sample('run',.25); transition.apply(1.09);
  const midway = hip.rotationQuaternion.clone();
  rig.sample('run',.25); transition.apply(1.09);
  expect(Math.abs(Quaternion.Dot(midway,hip.rotationQuaternion))).toBeCloseTo(1,6);
  transition.start(1.09); rig.sample('walk',.7); transition.apply(1.09);
  expect(Math.abs(Quaternion.Dot(midway,hip.rotationQuaternion))).toBeCloseTo(1,6);
  rig.sample('walk',.7); const target = hip.rotationQuaternion.clone(); transition.apply(1.28);
  expect(Math.abs(Quaternion.Dot(target,hip.rotationQuaternion))).toBeCloseTo(1,6);
  expect(transition.active(1.29)).toBe(false);
  transition.start(2); rig.sample('run',.4); transition.apply(2.08);
  expect(transition.active(3)).toBe(true);
  // A paused local clip still needs its final unblended pose sampled once.
  rig.sample('run',.4); transition.apply(3);
  expect(transition.active(3)).toBe(false);
  transition.start(4); rig.sample('walk',.2); transition.apply(.1);
  expect(transition.active(.2)).toBe(false);
});

it.each(['male.glb','male-lod1.glb','male-lod2.glb','female.glb','female-lod1.glb','female-lod2.glb'])(
  'keeps the shoes above the floor through starts and stops on %s', file => {
  const rig = load(file);
  applyCompleteAvatarLocomotion(file.startsWith('female') ? 'female' : 'male',rig.skeleton,rig.groups);
  let lowest = Infinity, highest = -Infinity;
  for (const state of ['walk','run']) for (const phase of [0,.125,.25,.375,.5,.625,.75,.875]) {
    for (const stopping of [false,true]) {
      rig.sample(stopping ? state : 'idle',stopping ? phase : 0);
      const transition = createAvatarPoseTransition(rig.skeleton,soleProbes[file.startsWith('female') ? 'female' : 'male']);
      transition.apply(0);
      transition.start(1);
      for (const time of [1,1.045,1.09,1.135,1.18]) {
        rig.sample(stopping ? 'idle' : state,stopping ? 0 : phase);
        transition.apply(time);
        const floor = rig.shoePoints().reduce((min,p) => Math.min(min,p.y),Infinity);
        lowest = Math.min(lowest,floor); highest = Math.max(highest,floor);
        expect(floor,`${state} ${phase} ${stopping ? 'stop' : 'start'} ${time}`).toBeGreaterThan(-.002);
      }
    }
  }
  expect(lowest).toBeGreaterThan(-.002);
  expect(highest).toBeLessThan(.004);
});

it('retains contact through interrupted transitions while the player moves, turns and crouches', () => {
  const rig = load('female-lod2.glb');
  const avatar = createCompleteAvatarFromAssets(scene,'female',{
    meshes:[],transformNodes:[rig.root,...rig.nodes],skeletons:[rig.skeleton],animationGroups:rig.groups,
  },{sampledAnimationRate:60,persistWardrobe:false});
  const anchor = new TransformNode('moving-player',scene);
  avatar.root.parent = anchor;
  avatar.animate(.2,'run');
  avatar.animate(.3,'idle');
  avatar.animate(.39,'idle');
  const before = rig.skeleton.bones.map(bone => {
    const node = bone.getTransformNode();
    return { p:node.position.clone(),q:node.rotationQuaternion.clone() };
  });
  anchor.position.set(7,1.6,-12); anchor.rotation.y = 1.4; anchor.scaling.setAll(1.15);
  avatar.animate(.39,'walk');
  rig.skeleton.bones.forEach((bone,index) => {
    const node = bone.getTransformNode();
    expect(Vector3.Distance(node.position,before[index].p)).toBeLessThan(.00001);
    expect(Math.abs(Quaternion.Dot(node.rotationQuaternion,before[index].q))).toBeCloseTo(1,6);
  });
  // Contact is measured relative to the moving/scaled player, including when
  // the crouch overlay runs on top of an interrupted movement transition.
  for (const time of [.42,.47,.52,.57,.65]) {
    avatar.animate(time,'walk',true);
    const inverse = anchor.computeWorldMatrix(true).clone().invert();
    const floor = rig.shoePoints().reduce((min,p) => Math.min(min,Vector3.TransformCoordinates(p,inverse).y),Infinity);
    expect(floor,`crouched transition at ${time}`).toBeGreaterThan(-.002);
    expect(floor).toBeLessThan(.004);
  }
  avatar.release();
});

it.each(['male','female'].flatMap(sex => [['walk','run'],['run','walk']].map(pair => [sex,...pair])))(
  'keeps the %s foot moving when %s changes to %s', (sex,from,to) => {
  const rig = load(`${sex}-lod2.glb`);
  applyCompleteAvatarLocomotion(sex,rig.skeleton,rig.groups);
  const transition = createAvatarPoseTransition(rig.skeleton,soleProbes[sex]);
  const duration = state => { const g = rig.groups.find(g => g.name === state); return (g.to-g.from)/30; };
  const dt = 1/60, phase = .28;
  rig.sample(from,phase-dt/duration(from)); transition.apply(0);
  const earlier = pos(rig.joint('foot_l'));
  rig.sample(from,phase); transition.apply(dt);
  const before = pos(rig.joint('foot_l'));
  transition.start(dt);
  rig.sample(to,phase+dt/duration(to)); transition.apply(2*dt);
  const after = pos(rig.joint('foot_l'));
  const retained = (after.z-before.z)/(before.z-earlier.z);
  expect(retained).toBeGreaterThan(.45);
  expect(retained).toBeLessThan(1.5);
});

it.each(['male','female'])('bounds %s follow-through and sole contact through live gait changes', sex => {
  const rig = load(`${sex}-lod2.glb`);
  applyCompleteAvatarLocomotion(sex,rig.skeleton,rig.groups);
  const duration = state => { const g = rig.groups.find(g => g.name === state); return (g.to-g.from)/30; };
  rig.sample('idle',0);
  const standingHip = pos(rig.joint('pelvis')).y;
  for (const rate of [30,60]) for (const from of ['walk','run']) {
    for (const to of ['idle',from === 'walk' ? 'run' : 'walk']) for (const phase of [0,.125,.25,.375,.5,.625,.75,.875]) {
      const transition = createAvatarPoseTransition(rig.skeleton,soleProbes[sex]);
      const dt = 1/rate;
      rig.sample(from,(phase-dt/duration(from)+1)%1); transition.apply(0);
      rig.sample(from,phase); transition.apply(dt); transition.start(dt);
      for (let step = 0; step <= Math.ceil(.18*rate); step++) {
        const time = step*dt;
        rig.sample(to,((to === 'idle' ? 0 : phase)+time/duration(to))%1);
        transition.apply(dt+time);
        const floor = rig.shoePoints().reduce((min,p) => Math.min(min,p.y),Infinity);
        expect(floor,`${from}->${to} phase ${phase} time ${time}`).toBeGreaterThan(-.002);
        expect(standingHip-pos(rig.joint('pelvis')).y).toBeLessThan(.055);
        for (const side of ['l','r']) {
          const forearm = pos(rig.joint(`hand_${side}`)).subtract(pos(rig.joint(`lowerarm_${side}`))).normalize();
          expect(-forearm.y).toBeGreaterThan(.43);
        }
      }
    }
  }
});

it('advances the first displayed frame when the sampled avatar switches gait', () => {
  const rig = load('female-lod2.glb');
  const avatar = createCompleteAvatarFromAssets(scene,'female',{
    meshes:[],transformNodes:[rig.root,...rig.nodes],skeletons:[rig.skeleton],animationGroups:rig.groups,
  },{sampledAnimationRate:60,persistWardrobe:false});
  const dt = 1/60;
  avatar.animate(.2-dt,'run'); const earlier = pos(rig.joint('foot_l'));
  avatar.animate(.2,'run'); const before = pos(rig.joint('foot_l'));
  avatar.animate(.2+dt,'walk'); const after = pos(rig.joint('foot_l'));
  expect((after.z-before.z)/(before.z-earlier.z)).toBeGreaterThan(.45);
  avatar.release();
});
