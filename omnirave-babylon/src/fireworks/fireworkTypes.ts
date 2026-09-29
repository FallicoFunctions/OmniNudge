export type Vec3 = [number, number, number];
export type Rgb = [number, number, number];
export type FireworkFamily = 'peony' | 'chrysanthemum' | 'dahlia' | 'pistil' | 'brocade' | 'willow' | 'palm' | 'coconut' | 'spider' | 'waterfall' | 'strobe' | 'glitter' | 'crackle' | 'rain' | 'leaves' | 'snow' | 'crossette' | 'fish' | 'bees' | 'dragon' | 'jellyfish' | 'ring' | 'spiral' | 'whirlwind' | 'wave';

/** Review studies: local shell lifetimes, never a show schedule. */
export interface FireworkDefinition {
  id: string;
  name: string;
  family: FireworkFamily;
  description: string;
  ascentBrief: string;
  explosionBrief: string;
  soundBrief: string;
  recognition: string;
  color: Rgb;
  trailColor: Rgb;
  stars: number;
  speed: number;
  life: number;
  drag: number;
  gravity: number;
  tail: number;
  width: number;
  glitter: number;
  sound: { bass: number; attack: number; decay: number; burn: number; whistle: boolean };
}

export interface StudyStar {
  id: number;
  origin: Vec3;
  velocity: Vec3;
  birth: number;
  life: number;
  drag: number;
  gravity: number;
  tail: number;
  width: number;
  color: Rgb;
  trailColor: Rgb;
  phase: number;
  behavior: 'ballistic' | 'flutter' | 'fish' | 'bee' | 'dragon' | 'whirl' | 'wave' | 'rocket';
  strobe: boolean;
  glitter: number;
  parent?: number;
}

export interface StudyEvent {
  time: number;
  position: Vec3;
  kind: 'launch' | 'break' | 'split' | 'crackle';
  strength: number;
}

export interface FireworkStudy {
  definition: FireworkDefinition;
  seed: number;
  ascent: number;
  duration: number;
  stars: StudyStar[];
  events: StudyEvent[];
}
