import type { FireworkDefinition, FireworkStudy, StudyStar, Vec3 } from './fireworkTypes';

export const ASCENT_SECONDS = 2.4;
export const BURST_HEIGHT = 45;
export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
export function parseStudySeed(raw: string | null): number {
  const value = Number(raw);
  return raw !== null && /^\d{1,10}$/.test(raw) && Number.isSafeInteger(value) && value <= 0xffffffff ? value >>> 0 : 42;
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Absolute-time evaluation allows backward scrubbing with no replay approximation. */
export function sampleStar(star: StudyStar, age: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const t = Math.max(0, age);
  if (star.behavior === 'rocket') {
    const u = clamp(t / ASCENT_SECONDS, 0, 1);
    out[0] = Math.sin(u * Math.PI) * .4;
    out[1] = BURST_HEIGHT * (2 * u - u * u);
    out[2] = 0;
    return out;
  }
  const k = star.drag;
  const travel = -Math.expm1(-k * t) / k;
  out[0] = star.origin[0] + star.velocity[0] * travel + .035 * t * t;
  out[1] = star.origin[1] + star.velocity[1] * travel - star.gravity / k * (t - travel);
  out[2] = star.origin[2] + star.velocity[2] * travel + .012 * t * t;
  if (star.behavior === 'ballistic') return out;
  const phase = star.phase;
  if (star.behavior === 'whirl' || star.behavior === 'wave') {
    const angle = star.behavior === 'whirl' ? .64 * (1 - Math.exp(-t)) : .08 * Math.sin(t * 3.4) * (1 - Math.exp(-t * 3));
    const x = out[0] - star.origin[0], y = out[1] - star.origin[1];
    out[0] = star.origin[0] + x * Math.cos(angle) - y * Math.sin(angle);
    out[1] = star.origin[1] + x * Math.sin(angle) + y * Math.cos(angle);
  } else {
    const flutter = star.behavior === 'flutter';
    const frequency = flutter ? 1.8 : star.behavior === 'dragon' ? 5.2 : star.behavior === 'bee' ? 11 : 4.3;
    const amplitude = flutter ? .7 : star.behavior === 'dragon' ? 1.45 : star.behavior === 'bee' ? .9 : 1.4;
    const activeTime = star.behavior === 'fish' || star.behavior === 'bee' ? Math.min(t, 1.8) : t;
    const envelope = amplitude * (1 - Math.exp(-activeTime * 3));
    out[0] += (Math.sin(activeTime * frequency + phase) - Math.sin(phase)) * envelope;
    out[2] += (Math.cos(activeTime * frequency + phase) - Math.cos(phase)) * envelope;
    if (!flutter) out[1] += Math.sin(activeTime * frequency * .7) * envelope * .45;
  }
  return out;
}

export function starBrightness(star: StudyStar, age: number): number {
  if (age < 0 || age >= star.life) return 0;
  const fade = Math.pow(Math.min(1, (star.life - age) / Math.min(1.25, star.life * .45)), 1.6);
  const ignition = Math.min(1, age / .035 + .15);
  const flicker = .84 + .16 * Math.sin(age * 27 + star.phase);
  const strobe = star.strobe ? Math.pow(Math.max(0, Math.sin(age * (9 + star.phase * .45) + star.phase)), 6) : 1;
  return fade * ignition * flicker * strobe;
}

export function createFireworkStudy(definition: FireworkDefinition, seed: number): FireworkStudy {
  const random = seededRandom(seed);
  const family = definition.family;
  const stars: StudyStar[] = [];
  const study: FireworkStudy = { definition, seed: seed >>> 0, stars, ascent: ASCENT_SECONDS, duration: 0,
    events: [{ time: 0, position: [0, 0, 0], kind: 'launch', strength: .65 },
      { time: ASCENT_SECONDS, position: [0, BURST_HEIGHT, 0], kind: 'break', strength: 1 }] };
  const add = (overrides: Partial<StudyStar> = {}): StudyStar => {
    const star: StudyStar = { id: stars.length, origin: [0, BURST_HEIGHT, 0], velocity: [0, 0, 0],
      birth: ASCENT_SECONDS, life: definition.life * (.82 + random() * .32), drag: definition.drag,
      gravity: definition.gravity, tail: definition.tail, width: definition.width,
      color: [...definition.color], trailColor: [...definition.trailColor], phase: random() * Math.PI * 2,
      behavior: 'ballistic', strobe: family === 'strobe', glitter: definition.glitter, ...overrides };
    stars.push(star); return star;
  };
  add({ behavior: 'rocket', birth: 0, life: ASCENT_SECONDS, origin: [0, 0, 0], tail: family === 'palm' ? 1.6 : .75,
    width: family === 'palm' ? .19 : .09, glitter: family === 'palm' ? 8 : 3, strobe: false,
    color: [...definition.color], trailColor: [...definition.trailColor] });
  const orientation = random() * Math.PI * 2;
  for (let i = 0; i < definition.stars; i++) {
    const y = 1 - 2 * (i + .5) / definition.stars;
    const angle = i * 2.3999632297 + orientation;
    const ring = Math.sqrt(1 - y * y);
    let direction: Vec3 = [ring * Math.cos(angle), y, ring * Math.sin(angle)];
    const speed = definition.speed * (.9 + random() * .2);
    if (family === 'palm') direction = [Math.cos(angle) * .82, .5 + random() * .34, Math.sin(angle) * .82];
    if (family === 'waterfall') direction = [direction[0] * .8, .1 + random() * .4, direction[2] * .8];
    if (family === 'willow') direction[1] = Math.abs(direction[1]) * .62 + .05;
    if (family === 'jellyfish') direction[1] = Math.abs(direction[1]) * .65;
    if (family === 'ring' || family === 'spiral' || family === 'wave' || family === 'whirlwind') {
      const u = (i + .5) / definition.stars;
      const a = family === 'spiral' ? u * Math.PI * 4.15 : family === 'wave' ? u * Math.PI : u * Math.PI * 2;
      const radius = family === 'spiral' ? .1 + u * .9 : 1;
      direction = [Math.cos(a) * radius, Math.sin(a) * radius, (random() - .5) * .015];
    }
    const behavior = family === 'leaves' || family === 'snow' ? 'flutter' : family === 'fish' ? 'fish'
      : family === 'bees' ? 'bee' : family === 'dragon' ? 'dragon' : family === 'whirlwind' ? 'whirl'
        : family === 'wave' ? 'wave' : 'ballistic';
    const star = add({ velocity: direction.map(v => v * speed) as Vec3, behavior });
    if (family === 'crossette' || family === 'crackle') {
      const splitAge = family === 'crossette' ? 1.25 + random() * .36 : 1.5 + random() * 1.1;
      star.life = splitAge;
      const origin = sampleStar(star, splitAge);
      const before = sampleStar(star, splitAge - .001);
      const inherited = origin.map((v, axis) => (v - before[axis]) * 1000) as Vec3;
      const splitTime = star.birth + splitAge;
      study.events.push({ time: splitTime, position: [...origin], kind: family === 'crossette' ? 'split' : 'crackle', strength: family === 'crossette' ? .22 : .12 });
      const count = family === 'crossette' ? 4 : 9;
      // A 3D local plane perpendicular to the parent's velocity keeps four branches coherent.
      const mag = Math.hypot(...direction);
      const normal = direction.map(v => v / mag) as Vec3;
      const cross: Vec3 = Math.abs(normal[1]) < .9 ? [-normal[2], 0, normal[0]] : [0, normal[2], -normal[1]];
      const len = Math.hypot(...cross);
      const u = cross.map(v => v / len) as Vec3;
      const v: Vec3 = [normal[1]*u[2]-normal[2]*u[1], normal[2]*u[0]-normal[0]*u[2], normal[0]*u[1]-normal[1]*u[0]];
      for (let child = 0; child < count; child++) {
        const a = child / count * Math.PI * 2;
        const velocity = family === 'crossette' ? inherited.map((speed, axis) => speed + (Math.cos(a)*u[axis] + Math.sin(a)*v[axis]) * 8) as Vec3
          : inherited.map(speed => speed * .3 + (random() - .5) * 12) as Vec3;
        add({ parent: star.id, origin: [...origin], birth: splitTime, velocity, life: family === 'crossette' ? 1.3 + random() * .35 : .18 + random() * .32,
          width: family === 'crossette' ? .13 : .075, tail: family === 'crossette' ? .65 : .16, glitter: 0,
          color: family === 'crossette' ? [.55, 1, .69] : [1, .8, .43] });
      }
    }
    if (family === 'rain') {
      for (let j = 0; j < 3; j++) {
        const age = 1.7 + random() * (star.life - 2);
        const origin = sampleStar(star, age);
        const time = star.birth + age;
        study.events.push({ time, position: origin, kind: 'crackle', strength: .025 });
        add({ parent: star.id, origin, birth: time, velocity: [(random()-.5)*2,-1-random()*2,(random()-.5)*2],
          life: .25 + random() * .45, width: .07, tail: .18, glitter: 1, color: [1,.87,.52] });
      }
    }
    if (family === 'snow') for (let child = 0; child < 4; child++) add({ velocity: star.velocity.map(v => v + (random()-.5)*1.4) as Vec3,
      width: .065, behavior: 'flutter', phase: star.phase, tail: .08, glitter: 0, life: star.life });
  }
  if (family === 'pistil') for (let i = 0; i < 85; i++) {
    const y = 1-2*(i+.5)/85, a = i*2.399963+orientation, r = Math.sqrt(1-y*y);
    add({ velocity: [Math.cos(a)*r*6,y*6,Math.sin(a)*r*6], color: [.1,1,.43], trailColor: [.3,1,.56], tail:.05,
      life: 2.7 + random()*.3, width:.14, glitter:0 });
  }
  if (family === 'jellyfish') for (let i = 0; i < 16; i++) {
    const a = i/16*Math.PI*2;
    add({ velocity:[Math.cos(a)*5.5,-1-random()*1.2,Math.sin(a)*5.5], color:[1,.88,.58], trailColor:[1,.67,.25],
      life:6.5+random()*.6, tail:2.2, gravity:.9, width:.12, glitter:3 });
  }
  study.events.sort((a,b) => a.time-b.time);
  study.duration = Math.max(...stars.map(star => star.birth + star.life + star.tail)) + .55;
  return study;
}

export function studyPhase(study: FireworkStudy, time: number): string {
  if (time < study.ascent) return 'Ascent';
  if (time < study.ascent + .25) return 'Break';
  if (time >= study.duration - .55) return 'Finished';
  if (time > study.ascent + study.definition.life * .65) return 'Falloff';
  return 'Expansion';
}
