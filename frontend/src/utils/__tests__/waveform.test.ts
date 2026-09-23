import { describe, expect, it } from 'vitest';
import { WAVEFORM_BARS, waveformPeaks } from '../waveform';

describe('waveformPeaks', () => {
  it('draws one bar per slice from the loudest sample in it, as the server does', () => {
    const samples = new Float32Array(WAVEFORM_BARS * 10);
    samples[5] = -0.5; // bar 0, negative: the magnitude counts
    samples[15] = 0.25; // bar 1
    samples[999] = 1.7; // bar 99, clipped to 1

    const peaks = waveformPeaks(samples);
    expect(peaks).toHaveLength(WAVEFORM_BARS);
    expect(peaks[0]).toBe(0.5);
    expect(peaks[1]).toBe(0.25);
    expect(peaks[2]).toBe(0);
    expect(peaks[99]).toBe(1);
  });

  it('still draws every bar for a recording shorter than the bar count', () => {
    const peaks = waveformPeaks(new Float32Array([0.1, -0.9, 0.3]));
    expect(peaks).toHaveLength(WAVEFORM_BARS);
    expect(peaks.slice(0, 3).map((p) => Math.round(p * 10) / 10)).toEqual([0.1, 0.9, 0.3]);
    expect(peaks[3]).toBe(0);
  });
});
