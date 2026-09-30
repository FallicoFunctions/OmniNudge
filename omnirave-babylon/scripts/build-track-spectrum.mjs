#!/usr/bin/env node
// Builds <trackId>.spectrum from a stage track, for src/media/trackSpectrum.ts.
// Every player's lights read this file at the track position they hear, so
// the lights are the same for everyone and do not depend on a tab's audio.
//
//   node scripts/build-track-spectrum.mjs public/audio/<trackId>.mp3
//
// Writes public/audio/<trackId>.spectrum next to the input. Upload it with
// the audio file (RUNBOOK.md, "Stage audio"). Needs ffmpeg.
//
// Each frame is what an AnalyserNode with the game's settings (fftSize 256,
// smoothingTimeConstant 0.8, minDecibels -100, maxDecibels -30) returns from
// getByteFrequencyData, as specified by the Web Audio API: a Blackman window
// over the newest 256 samples of the mono downmix, an FFT, magnitudes
// smoothed over time, then decibels mapped to 0-255. The analyser smooths
// once per rendered frame, so this smooths at 60 Hz and keeps every second
// frame (30 per second); the game blends between them.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SAMPLE_RATE = 48000; // The usual AudioContext rate on desktop devices.
const FFT_SIZE = 256;
const BINS = FFT_SIZE / 2;
const SMOOTHING = 0.8;
const MIN_DB = -100;
const MAX_DB = -30;
const ANALYSIS_RATE = 60;
const OUTPUT_FPS = 30;
const HOP = SAMPLE_RATE / ANALYSIS_RATE;
const KEEP_EVERY = ANALYSIS_RATE / OUTPUT_FPS;
const HEADER_BYTES = 16;

const input = process.argv[2];
if (!input || !/\.(mp3|m4a|wav|ogg|flac)$/i.test(input)) {
  console.error('Usage: node scripts/build-track-spectrum.mjs public/audio/<trackId>.mp3');
  process.exit(1);
}
const output = input.replace(/\.[^.]+$/, '.spectrum');

const window = Float64Array.from({ length: FFT_SIZE }, (_, n) =>
  0.42 - 0.5 * Math.cos((2 * Math.PI * n) / FFT_SIZE) + 0.08 * Math.cos((4 * Math.PI * n) / FFT_SIZE));
const bitReversed = Uint16Array.from({ length: FFT_SIZE }, (_, i) => {
  let reversed = 0;
  for (let bit = 1, j = i; bit < FFT_SIZE; bit <<= 1, j >>= 1) reversed = (reversed << 1) | (j & 1);
  return reversed;
});
const cosTable = Float64Array.from({ length: FFT_SIZE / 2 }, (_, k) => Math.cos((2 * Math.PI * k) / FFT_SIZE));
const sinTable = Float64Array.from({ length: FFT_SIZE / 2 }, (_, k) => -Math.sin((2 * Math.PI * k) / FFT_SIZE));

const ring = new Float64Array(FFT_SIZE); // The newest FFT_SIZE mono samples.
let ringIndex = 0;
const real = new Float64Array(FFT_SIZE);
const imag = new Float64Array(FFT_SIZE);
const smoothed = new Float64Array(BINS);
const frames = [];
let analysisFrame = 0;

function analyse() {
  for (let n = 0; n < FFT_SIZE; n += 1) {
    const sample = ring[(ringIndex + n) % FFT_SIZE] * window[n];
    real[bitReversed[n]] = sample;
    imag[bitReversed[n]] = 0;
  }
  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const step = FFT_SIZE / size;
    for (let start = 0; start < FFT_SIZE; start += size) {
      for (let k = 0; k < half; k += 1) {
        const a = start + k;
        const b = a + half;
        const tr = cosTable[k * step] * real[b] - sinTable[k * step] * imag[b];
        const ti = cosTable[k * step] * imag[b] + sinTable[k * step] * real[b];
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
      }
    }
  }
  const keep = analysisFrame % KEEP_EVERY === 0;
  const frame = keep ? new Uint8Array(BINS) : undefined;
  for (let k = 0; k < BINS; k += 1) {
    const magnitude = Math.hypot(real[k], imag[k]) / FFT_SIZE;
    smoothed[k] = SMOOTHING * smoothed[k] + (1 - SMOOTHING) * magnitude;
    if (frame) {
      const db = 20 * Math.log10(smoothed[k]);
      const value = Math.floor((255 / (MAX_DB - MIN_DB)) * (db - MIN_DB));
      frame[k] = Number.isFinite(value) ? Math.max(0, Math.min(255, value)) : 0;
    }
  }
  if (frame) frames.push(frame);
  analysisFrame += 1;
}

const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-i', input, '-f', 'f32le', '-ac', '2', '-ar', String(SAMPLE_RATE), 'pipe:1'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
let leftover = Buffer.alloc(0);
let sampleCount = 0;
analyse(); // Frame 0: the time before the first sample.
ffmpeg.stdout.on('data', (chunk) => {
  const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
  const usable = data.length - (data.length % 8);
  for (let offset = 0; offset < usable; offset += 8) {
    // The Web Audio "speakers" downmix of stereo to mono: (L + R) / 2.
    ring[ringIndex] = (data.readFloatLE(offset) + data.readFloatLE(offset + 4)) / 2;
    ringIndex = (ringIndex + 1) % FFT_SIZE;
    sampleCount += 1;
    if (sampleCount % HOP === 0) analyse();
  }
  leftover = data.subarray(usable);
});
ffmpeg.on('close', (code) => {
  if (code !== 0) {
    console.error(`ffmpeg failed with code ${code}`);
    process.exit(1);
  }
  const body = Buffer.alloc(HEADER_BYTES + frames.length * BINS);
  body.write('OMSP', 0, 'ascii');
  body.writeUInt16LE(OUTPUT_FPS, 4);
  body.writeUInt16LE(BINS, 6);
  body.writeUInt32LE(frames.length, 8);
  frames.forEach((frame, index) => body.set(frame, HEADER_BYTES + index * BINS));
  writeFileSync(output, body);
  console.log(`${output}: ${frames.length} frames (${(frames.length / OUTPUT_FPS).toFixed(1)} s), ${body.length} bytes`);
});
