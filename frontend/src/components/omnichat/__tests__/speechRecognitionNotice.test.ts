import { describe, expect, it } from 'vitest';
import { speechRecognitionNotice } from '../OmniChatCallModal';

// The codes were discarded, so every failure looked the same from the outside:
// press the button, speak, nothing happens. A denied microphone and a call that
// simply heard nothing need completely different things from the person holding
// the phone.
describe('speechRecognitionNotice', () => {
  it('tells somebody whose microphone was refused what to do about it', () => {
    for (const code of ['not-allowed', 'service-not-allowed']) {
      expect(speechRecognitionNotice(code)).toContain('microphone');
    }
  });

  it('says plainly when it simply heard nothing', () => {
    expect(speechRecognitionNotice('no-speech')).toContain("didn't hear");
  });

  it('names the browser problem when the service cannot be reached', () => {
    const notice = speechRecognitionNotice('network');
    expect(notice).toContain('network service');
    expect(notice).toContain('type below');
  });

  // Stopping on purpose is not a failure and must not shout at anybody.
  it('says nothing when the listener was stopped deliberately', () => {
    expect(speechRecognitionNotice('aborted')).toBe('');
  });

  // An unknown code still reaches the person, because a code we have not seen
  // is exactly the one worth reading.
  it('passes an unrecognised code through rather than swallowing it', () => {
    expect(speechRecognitionNotice('language-not-supported')).toContain('language-not-supported');
    expect(speechRecognitionNotice(undefined)).toContain('type below');
  });

  // Every branch offers a way to keep talking. A call that can only tell you it
  // failed is a call you have to hang up.
  it('always leaves a way to carry on', () => {
    for (const code of ['not-allowed', 'no-speech', 'audio-capture', 'network', undefined]) {
      const notice = speechRecognitionNotice(code);
      expect(notice.length).toBeGreaterThan(0);
    }
  });
});
