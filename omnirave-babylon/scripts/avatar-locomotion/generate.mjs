import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine, Quaternion, Scene, Vector3 } from '@babylonjs/core/index.js';
import { readRig } from './readRig.mjs';

// Author in metres in Babylon's converted rig space (+Z forward). This writes
// small animation-only data; the protected GLBs, garments and LODs stay intact.
const project = new URL('../../', import.meta.url);
const engine = new NullEngine();
const result = {};
const soleProbes = {};
const position = node => { node.computeWorldMatrix(true); return node.getAbsolutePosition().clone(); };
const parentDirection = (node, vector) => Vector3.TransformNormal(vector, node.parent.computeWorldMatrix(true).clone().invert());
function aim(node, child, target) {
  const origin = position(node);
  const a = parentDirection(node, position(child).subtract(origin)).normalize();
  const b = parentDirection(node, target.subtract(origin)).normalize();
  node.rotationQuaternion = Quaternion.FromUnitVectorsToRef(a, b, new Quaternion()).multiply(node.rotationQuaternion);
  node.computeWorldMatrix(true);
}
function rotate(node, axis, angle) {
  const parity = node.parent.computeWorldMatrix(true).determinant() < 0 ? -1 : 1;
  node.rotationQuaternion = Quaternion.RotationAxis(parentDirection(node, axis).normalize(), angle * parity).multiply(node.rotationQuaternion);
  node.computeWorldMatrix(true);
}
// Cubic Hermite knots [phase, value, slope]. Explicit contact tangents keep
// the foot moving backwards through touchdown/toe-off without a velocity snap.
function curve(knots, u) {
  const i = Math.max(0, knots.findIndex((k, index) => index < knots.length - 1 && u <= knots[index + 1][0]));
  const [a, b] = [knots[i], knots[i + 1]], span = b[0] - a[0], t = (u - a[0]) / span;
  return (2*t**3-3*t*t+1)*a[1] + (t**3-2*t*t+t)*span*a[2]
    + (-2*t**3+3*t*t)*b[1] + (t**3-t*t)*span*b[2];
}

for (const sex of ['male', 'female']) {
  const scene = new Scene(engine);
  const rig = readRig(scene, fileURLToPath(new URL(`public/assets/avatars/complete-pair/${sex}.glb`, project)));
  rig.sample('idle', 0);
  const base = rig.nodes.map(node => ({ node, p: node.position.clone(), q: node.rotationQuaternion.clone(), s: node.scaling.clone() }));
  const reset = () => base.forEach(({node,p,q,s}) => { node.position.copyFrom(p); node.rotationQuaternion.copyFrom(q); node.scaling.copyFrom(s); });
  const feet = ['l','r'].map(side => {
    const thigh = rig.joint(`thigh_${side}`), calf = rig.joint(`calf_${side}`), foot = rig.joint(`foot_${side}`);
    return { thigh, calf, foot, ankle: position(foot), world: foot.getWorldMatrix().clone(),
      upper: Vector3.Distance(position(thigh), position(calf)), lower: Vector3.Distance(position(calf), position(foot)) };
  });
  // A handful of actual sole vertices covers the heel/toe contact envelope.
  // Runtime transitions can check these points without skinning shoe meshes.
  const shoes = rig.shoePoints();
  soleProbes[sex] = Object.fromEntries(feet.map((leg,index) => {
    const points = shoes.filter(point => Vector3.DistanceSquared(point,leg.ankle)
      < Vector3.DistanceSquared(point,feet[1-index].ankle));
    leg.sole = points.map(point => point.subtract(leg.ankle));
    const selected = new Set();
    for (const pitch of [-.12,0,.15,.3,.5]) for (const roll of [-.03,0,.03]) {
      const normal = new Vector3(Math.sin(roll),Math.cos(pitch)*Math.cos(roll),Math.sin(pitch));
      selected.add(points.reduce((lowest,point) => Vector3.Dot(point,normal) < Vector3.Dot(lowest,normal) ? point : lowest));
    }
    const inverse = leg.world.clone().invert();
    return [leg.foot.name,[...selected].map(point => Vector3.TransformCoordinates(point,inverse).asArray().map(value => +value.toFixed(7)))];
  }));
  const bodyJoints = ['Root','pelvis','spine_01','spine_02','spine_03','neck_01','head',
    ...['l','r'].flatMap(side => ['thigh','calf','foot','upperarm','lowerarm','hand'].map(name => `${name}_${side}`))];
  const clips = {};
  for (const state of ['walk','run']) {
    const run = state === 'run';
    const joints = [...bodyJoints,...(run ? ['l','r'].flatMap(side =>
      ['index','middle','ring','pinky','thumb'].flatMap(finger => [1,2,3].map(segment => `${finger}_0${segment}_${side}`))) : [])];
    const tracks = Object.fromEntries(joints.map(name => [name, { position: [], rotationQuaternion: [] }]));
    // Dense once at authoring time; runtime just uses Babylon's normal sampler.
    const samples = 64;
    for (let frame = 0; frame <= samples; frame++) {
      const phase = frame === samples ? 0 : frame / samples, angle = phase * Math.PI * 2;
      reset();
      const root = rig.joint('Root');
      const bob = run ? curve([[0,-.029,-.06],[.13,-.043,0],[.36,-.020,.18],[.44,-.012,0],[.5,-.029,-.06]], phase % .5)
        : -.011 - .010 * Math.cos(angle * 2);
      root.position.addInPlace(parentDirection(root, new Vector3(run ? .005*Math.sin(angle)
        : -.015*Math.sin(angle-.10), bob, 0)));
      // Hips lead; the chest counter-rotates and the neck steadies the gaze.
      rotate(rig.joint('pelvis'), Vector3.Up(), (run ? .03 : .045)*Math.cos(angle));
      // At quarter-cycle the left foot supports the body: shift left and let
      // the unloaded right hip settle, with the chest keeping the gaze level.
      rotate(rig.joint('pelvis'), Vector3.Forward(), (run ? .008 : -.014)*Math.sin(angle));
      rotate(rig.joint('spine_01'), Vector3.Right(), run ? .04 : .01);
      rotate(rig.joint('spine_02'), Vector3.Right(), run ? .05 : .005);
      rotate(rig.joint('spine_03'), Vector3.Up(), run ? -.065*Math.cos(angle) : -.062*Math.cos(angle-.22));
      if (!run) rotate(rig.joint('spine_02'),Vector3.Forward(),.01*Math.sin(angle-.28));
      rotate(rig.joint('neck_01'), Vector3.Right(), run ? -.06 : -.01);
      rotate(rig.joint('neck_01'), Vector3.Up(), run ? .035*Math.cos(angle) : .016*Math.cos(angle-.35));
      const targets = feet.map((leg,index) => {
        const u = (phase + index*.5) % 1;
        // Begin recovery soon after the opposite heel lands. A long, flat
        // double-support interval made every landing read as a held pose.
        const stance = run ? .36 : .58, travel = run ? .54 : .40;
        const front = run ? .20 : .19, back = front - travel;
        const velocity = -travel / stance;
        const forward = u <= stance ? front + velocity*u : curve(run
          ? [[stance,back,velocity],[.47,-.36,1.1],[.73,.17,1.4],[.88,.25,-.15],[1,front,velocity]]
          : [[stance,back,velocity],[.74,-.07,1.8],[.90,.205,.25],[1,front,velocity]], u);
        // Contact already rises through the foot's heel/toe roll. Adding a
        // swing lift during stance makes the grounding correction lower the
        // whole body by that extra lift, creating a squat on every step.
        const lift = curve(run
          ? [[0,0,0],[stance,0,0],[.56,.10,0],[.74,.065,-.4],[.93,.012,-.25],[1,0,0]]
          : [[0,0,0],[stance,0,0],[.77,.038,0],[.90,.016,-.24],[1,0,0]], u);
        const pitch = curve(run
          ? [[0,-.07,0],[.08,0,0],[.22,0,0],[stance,.32,.8],[.49,.45,0],[.74,.07,-.8],[.93,-.07,0],[1,-.07,0]]
          : [[0,-.08,0],[.07,0,0],[.36,0,0],[stance,.28,.8],[.73,.10,-1.4],[.92,-.08,0],[1,-.08,0]], u);
        const ankle = leg.ankle.add(new Vector3(0, lift, forward));
        // Place each walking shoe on its actual sole as it rolls. A generic
        // heel/toe radius left the landing foot hovering while the rear toe
        // kept supporting the body, delaying the visible weight transfer.
        if (run) ankle.y += Math.max(0, Math.sin(pitch) * (pitch > 0 ? .15 : -.075));
        else ankle.y = lift - Math.min(...leg.sole.map(point => point.y*Math.cos(pitch)-point.z*Math.sin(pitch)));
        return { leg, ankle, pitch, u };
      });
      // Give the legs enough reach before solving them. Clamping a target
      // beyond a fully straight leg makes the knee snap shut, then reopen.
      // This smooth height adjustment retains a small bend without stretching
      // bones, shifting the planted feet, or adding a crouched baseline.
      const softness = run ? .007 : .003;
      let reachPressure = 1;
      for (const {leg,ankle} of targets) {
        const hip = position(leg.thigh);
        const reachSquared = leg.upper**2+leg.lower**2+2*leg.upper*leg.lower*Math.cos(.16);
        const horizontalSquared = (ankle.x-hip.x)**2+(ankle.z-hip.z)**2;
        const maxHipHeight = ankle.y+Math.sqrt(Math.max(0,reachSquared-horizontalSquared));
        reachPressure += Math.exp((hip.y-maxHipHeight)/softness);
      }
      root.position.addInPlace(parentDirection(root,new Vector3(0,-softness*Math.log(reachPressure),0)));
      for (let index = 0; index < 2; index++) {
        const side = index === 0 ? 'l' : 'r', sign = index === 0 ? -1 : 1;
        const {leg,ankle,pitch,u} = targets[index], hip = position(leg.thigh);
        const delta = ankle.subtract(hip), direction = delta.normalizeToNew();
        const distance = Math.min(delta.length(), leg.upper+leg.lower-.00001);
        const along = (leg.upper**2-leg.lower**2+distance**2)/(2*distance);
        const bend = Vector3.Forward().subtract(direction.scale(Vector3.Dot(Vector3.Forward(), direction))).normalize();
        const knee = hip.add(direction.scale(along)).add(bend.scale(Math.sqrt(Math.max(0,leg.upper**2-along**2))));
        aim(leg.thigh, leg.calf, knee); aim(leg.calf, leg.foot, ankle);
        const footWorld = leg.world.clone();
        footWorld.multiply(leg.foot.parent.computeWorldMatrix(true).clone().invert()).decompose(undefined, leg.foot.rotationQuaternion);
        rotate(leg.foot, Vector3.Right(), pitch);
        // Let the elbow travel behind the torso. A forward-biased forearm on
        // a symmetric shoulder swing kept both hands held out like a tray.
        const swing = run ? -.065 - .265*Math.cos(u*Math.PI*2-.12)
          : -.175*Math.cos(u*Math.PI*2-.26) + .012*Math.sin(u*Math.PI*4+.25);
        const elbow = run ? .70 - .12*Math.cos(u*Math.PI*2-.30) : .15 - .055*Math.cos(u*Math.PI*2-.70);
        const upper = rig.joint(`upperarm_${side}`), lower = rig.joint(`lowerarm_${side}`), hand = rig.joint(`hand_${side}`);
        const clearance = sex === 'female' ? .21 : .12;
        aim(upper, lower, position(upper).add(new Vector3(sign*clearance, -Math.cos(swing), Math.sin(swing))));
        const forearm = new Vector3(run ? -sign*.045 : sign*(sex === 'female' ? .045 : .01), -Math.cos(swing+elbow), Math.sin(swing+elbow));
        aim(lower, hand, position(lower).add(forearm));
        if (run) {
          // Keep the wrist neutral and the palm edge following the forearm.
          // A relaxed, steady finger curl replaces the old gripping pulse.
          aim(hand,rig.joint(`middle_01_${side}`),position(hand).add(forearm));
          rotate(hand,Vector3.Right(),.018*Math.sin(u*Math.PI*2-.45));
          const across = position(rig.joint(`index_01_${side}`)).subtract(position(rig.joint(`pinky_01_${side}`)));
          const fingers = position(rig.joint(`middle_01_${side}`)).subtract(position(hand));
          const palm = Vector3.Cross(across,fingers).normalize().scale(-sign);
          for (const finger of ['index','middle','ring','pinky']) for (const segment of [1,2,3]) {
            const node = rig.joint(`${finger}_0${segment}_${side}`);
            const direction = Vector3.TransformNormal(Vector3.Up(),node.computeWorldMatrix(true)).normalize();
            rotate(node,Vector3.Cross(direction,palm).normalize(),segment === 1 ? .20 : segment === 2 ? .38 : .18);
          }
          const thumb = rig.joint(`thumb_02_${side}`);
          const thumbDirection = Vector3.TransformNormal(Vector3.Up(),thumb.computeWorldMatrix(true)).normalize();
          rotate(thumb,Vector3.Cross(thumbDirection,palm).normalize(),.08);
        } else {
          aim(hand,rig.joint(`middle_01_${side}`),position(hand).add(forearm));
          rotate(hand,Vector3.Right(),.035*Math.sin(u*Math.PI*2-.72));
        }
      }
      // Measure the actual skinned sneakers, including their heel and toe.
      const floor = rig.shoePoints().reduce((min, point) => Math.min(min,point.y), Infinity);
      const supported = !run || phase % .5 <= .36;
      const correction = supported ? -floor : Math.max(0,-floor);
      root.position.addInPlace(parentDirection(root,new Vector3(0,correction,0)));
      for (const name of joints) {
        const node = rig.joint(name), track = tracks[name];
        const previous = track.rotationQuaternion.at(-1);
        const rotation = node.rotationQuaternion.clone().normalize();
        if (previous && Quaternion.Dot(rotation, Quaternion.FromArray(previous)) < 0) rotation.scaleInPlace(-1);
        track.position.push(node.position.asArray().map(value => +value.toFixed(7)));
        track.rotationQuaternion.push(rotation.asArray().map(value => +value.toFixed(7)));
      }
    }
    // The lowest skinned shoe vertex can switch at heel/toe contact, leaving
    // tiny kinks in the measured root correction. Smooth only that translation
    // over neighbouring baked frames; the authored foot/limb timing stays put.
    for (let pass = 0; pass < 2; pass++) {
      const positions = tracks.Root.position;
      tracks.Root.position = positions.map((point,index) => {
        const i = index % samples;
        return point.map((_,axis) => +(positions[(i+samples-1)%samples][axis]*.25
          +positions[i][axis]*.5+positions[(i+1)%samples][axis]*.25).toFixed(7));
      });
    }
    clips[state] = tracks;
  }
  result[sex] = clips;
  scene.dispose();
}
engine.dispose();
writeFileSync(new URL('src/player/completeAvatarLocomotion.json',project), JSON.stringify(result)+'\n');
writeFileSync(new URL('src/player/completeAvatarSoleProbes.json',project), JSON.stringify(soleProbes)+'\n');
console.log('Wrote male/female walk and run keyframes.');
