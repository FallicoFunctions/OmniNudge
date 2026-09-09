import { describe, expect, it } from 'vitest';
import { describeSilence } from '../callRecorder';

// Three different faults wear one appearance: a quiet room, an analyser reading
// silence while somebody talks, and a recorder producing no data. Three
// attempts were spent guessing between them, so the answer names which.
describe('describeSilence', () => {
  it('names a suspended audio context, which reads silence however loudly anybody talks', () => {
    const notice = describeSilence(0, 3, 'suspended');
    expect(notice).toContain('suspended');
    expect(notice).toContain('Reload');
  });

  // A context that never ran is the same fault, and the reason it matters is
  // that it looks exactly like a broken microphone from the outside.
  it('names a closed context too', () => {
    expect(describeSilence(0, 3, 'closed')).toContain('closed');
  });

  it('names a recorder that produced nothing, separately from a quiet room', () => {
    const notice = describeSilence(0.5, 0, 'running');
    expect(notice).toContain('no audio');
  });

  // A real silence and a nearly-silence are different advice: check the input
  // device, or speak up.
  it('tells a dead input apart from a quiet one', () => {
    expect(describeSilence(0.0001, 4, 'running')).toContain('input device');
    expect(describeSilence(0.008, 4, 'running')).toContain('louder');
  });

  // Audible speech that still failed gets the plain answer, because the
  // measurements would tell nobody anything.
  it('says the ordinary thing when the audio was fine', () => {
    expect(describeSilence(0.4, 5, 'running')).toBe("I didn't catch that.");
  });

  // The numbers are the point. A notice without them sends somebody back to
  // guessing, which is what this replaced.
  it('carries the measurement, not just a verdict', () => {
    expect(describeSilence(0.0001, 4, 'running')).toMatch(/0\.000/);
  });
});
