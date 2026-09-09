import { describe, expect, it } from 'vitest';
import { transcriptionFailureNotice } from '../OmniChatCallModal';

// "That could not be transcribed" sent whoever read it nowhere. A recording the
// server could not parse, a transcoder that is not installed and a provider
// outage need three different things done about them.
describe('transcriptionFailureNotice', () => {
  it('tells a browser problem apart from a server one', () => {
    expect(transcriptionFailureNotice('recording_invalid')).toContain('not audio');
    expect(transcriptionFailureNotice('recording_unreadable')).toContain('damaged');
    expect(transcriptionFailureNotice('transcoder_unavailable')).toContain('convert audio');
    expect(transcriptionFailureNotice('transcription_failed')).toContain('could not be reached');
  });

  // Every one of them leaves a way to keep talking, because a call that can
  // only report failure is a call you have to hang up.
  it('always leaves a way to carry on', () => {
    for (const code of [
      'recording_invalid',
      'recording_unreadable',
      'transcoder_unavailable',
      'transcription_failed',
      undefined,
    ]) {
      expect(transcriptionFailureNotice(code).length).toBeGreaterThan(0);
    }
  });

  // A code nobody has mapped still reaches somebody, rather than becoming
  // silence.
  it('falls back rather than saying nothing', () => {
    expect(transcriptionFailureNotice('something-new')).toContain('could not be transcribed');
  });
});
