import { describe, expect, it, vi } from 'vitest';
import { describeSilence, openMicrophone } from '../callRecorder';

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

// Her voice goes through the call's own audio graph.
//
// A fresh Audio element is refused once the click that started the call has
// stopped counting as recent user activation -- and by the time she has been
// transcribed, answered and synthesised, it has. Reported as "it broke when it
// came time for her to speak", with the server having already returned her
// audio successfully.
describe('the call audio graph', () => {
  it('plays sound through a context the call has already unlocked', async () => {
    const decode = vi.fn().mockResolvedValue({ duration: 1 });
    const started: string[] = [];
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported = () => true;
      }
    );
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
          getAudioTracks: () => [{ label: 'x', muted: false, enabled: true, readyState: 'live' }],
        }),
      },
    });
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        destination = {};
        resume = () => Promise.resolve();
        decodeAudioData = decode;
        createAnalyser = () => ({
          fftSize: 2048,
          getFloatTimeDomainData: () => {},
          connect: () => {},
          disconnect: () => {},
        });
        createMediaStreamSource = () => ({ connect: () => {}, disconnect: () => {} });
        createGain = () => ({ gain: { value: 0 }, connect: () => {}, disconnect: () => {} });
        createBufferSource = () => {
          const node = {
            buffer: null,
            onended: null as (() => void) | null,
            connect: () => {},
            stop: () => {},
            start: () => {
              started.push('started');
              setTimeout(() => node.onended?.(), 0);
            },
          };
          return node;
        };
        close = () => Promise.resolve();
      }
    );

    const microphone = await openMicrophone();
    expect(typeof microphone).not.toBe('string');
    if (typeof microphone === 'string') return;

    expect(microphone.play).toBeTypeOf('function');
    // jsdom's Blob has no arrayBuffer, so the real shape is supplied here.
    const recording = Object.assign(new Blob(['audio'], { type: 'audio/wav' }), {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    await microphone.play(recording);

    // Decoded and played through this context, not handed to a new element.
    expect(decode).toHaveBeenCalled();
    expect(started).toEqual(['started']);
    microphone.release();
    vi.unstubAllGlobals();
  });
});
