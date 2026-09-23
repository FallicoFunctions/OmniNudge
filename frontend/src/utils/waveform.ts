/** Bars in a voice message waveform: the same count the server's job draws. */
export const WAVEFORM_BARS = 100;

/**
 * The bars for a recording: the loudest sample in each of WAVEFORM_BARS equal
 * slices, from 0 to 1 -- the same rule the server's waveform job uses, so a bar
 * means the same thing whichever side drew it.
 */
export function waveformPeaks(samples: Float32Array, bars = WAVEFORM_BARS): number[] {
  const slice = Math.max(1, Math.floor(samples.length / bars));
  return Array.from({ length: bars }, (_, bar) => {
    let peak = 0;
    const end = Math.min(samples.length, (bar + 1) * slice);
    for (let i = bar * slice; i < end; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    return Math.min(1, peak);
  });
}

/**
 * The waveform of a recording this device can play. An encrypted voice message
 * has no server-drawn waveform -- the server cannot read the audio -- so the
 * reader draws it from the decrypted recording.
 */
export async function waveformOf(audio: Blob): Promise<number[]> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await audio.arrayBuffer());
    return waveformPeaks(decoded.getChannelData(0));
  } finally {
    void context.close();
  }
}
