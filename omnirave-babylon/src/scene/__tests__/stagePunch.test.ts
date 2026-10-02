import { describe, expect, it } from 'vitest';
import { createStageBeat } from '../../media/trackBeats';
import { stepBassPunch } from '../stagePunch';

const beat = (bass: number, kick = false) => ({ ...createStageBeat(), bass, kick });

describe('stepBassPunch', () => {
  it('follows the real hits of the beat list: strength for the punch, the kick flag as is', () => {
    // A loud, steady level (no jump): the level guess would stay silent.
    expect({ ...stepBassPunch(beat(1, true), true, 0.85, 0.84, 0, 0.016, 0.25) }).toEqual({ punch: 1, hit: true, kick: true });
    expect({ ...stepBassPunch(beat(0.4), true, 0.85, 0.84, 0, 0.016, 0.25) }).toEqual({ punch: 0.4, hit: true, kick: false });
  });

  it('keeps a stronger punch when a weaker hit lands on its tail, and decays with no hit', () => {
    const weaker = stepBassPunch(beat(0.4), true, 0.85, 0.84, 0.9, 0.025, 0.25);
    expect(weaker.hit).toBe(false);
    expect(weaker.punch).toBeCloseTo(0.8, 5);
    expect(stepBassPunch(beat(0), true, 0.85, 0.84, 0.5, 0.025, 0.25).punch).toBeCloseTo(0.4, 5);
  });

  it('does not punch while there is no audio, also on a listed hit', () => {
    expect({ ...stepBassPunch(beat(1, true), false, 0, 0, 0, 0.016, 0.25) }).toEqual({ punch: 0, hit: false, kick: false });
  });

  it('lifts the punch on a bar start to the music energy: an accent in a drop, soft in a break', () => {
    const bar = (bass: number, energy: number) => ({ ...beat(bass, true), bar: true, energy });
    expect(stepBassPunch(bar(0.4, 0.9), true, 0.85, 0.84, 0, 0.016, 0.25).punch).toBeCloseTo(0.9, 6);
    expect(stepBassPunch(bar(0, 0.1), true, 0.85, 0.84, 0, 0.016, 0.25).punch).toBeCloseTo(0.1, 6);
    // Any other beat follows its bass hit, whatever the energy.
    expect(stepBassPunch({ ...beat(0.4, true), energy: 0.9 }, true, 0.85, 0.84, 0, 0.016, 0.25).punch).toBeCloseTo(0.4, 6);
  });

  it('guesses from the level only for a track with no beat list', () => {
    expect({ ...stepBassPunch(null, true, 0.8, 0.1, 0, 0.016, 0.25) }).toEqual({ punch: 1, hit: true, kick: true });
    expect({ ...stepBassPunch(null, true, 0.3, 0.1, 0, 0.016, 0.25) }).toEqual({ punch: 1, hit: true, kick: false });
    expect(stepBassPunch(null, true, 0.85, 0.84, 0, 0.016, 0.25).hit).toBe(false); // the loud-master case
  });
});
