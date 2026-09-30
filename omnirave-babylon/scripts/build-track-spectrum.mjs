#!/usr/bin/env node
// Builds <trackId>.spectrum and <trackId>.beats from a stage track, for
// src/media/trackSpectrum.ts and src/media/trackBeats.ts. Every player's
// lights read these files at the track position they hear, so the lights are
// the same for everyone and do not depend on a tab's audio.
//
//   node scripts/build-track-spectrum.mjs public/audio/<trackId>.mp3
//
// Writes both files next to the input. Upload them with the audio file
// (RUNBOOK.md, "Stage audio"). Needs ffmpeg.
//
// The beats file lists every bass hit (kick or bass note) with its time and
// a strength from 0 to 1, found from the 35-140 Hz band (see findBassHits).
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
  writeBeats();
});

// ---- bass hits ---------------------------------------------------------
//
// A loud club master keeps the bass band of the spectrum near its ceiling, so
// the show cannot find the kicks from the spectrum level (its old punch
// detector fired about once in two minutes on this set). The hits are found
// here instead, from the band-limited signal at 5 ms resolution:
//   1. ffmpeg band-passes 35-140 Hz and resamples to 8 kHz mono.
//   2. RMS envelope: 20 ms window, 5 ms hop.
//   3. Rise: how much the envelope grew over 10 ms (0 when it fell).
//   4. Strength: the rise divided by the 98th percentile of the rise within
//      4 s each side, so a quiet section is judged against itself. 1 is a
//      full kick; bass notes between kicks come out lower.
//   5. A hit is a local maximum of strength over BEAT_MIN_STRENGTH, at least
//      BEAT_MIN_GAP_SECONDS from a stronger one.
// HIT_TIME_OFFSET_SECONDS moves the reported time from the rise's maximum to
// the start of the sound: on synthetic kicks at known times the maximum came
// 5 ms (3 to 7) after each start.
const BEAT_RATE = 8000;
const BEAT_HOP = 40; // 5 ms
const BEAT_RMS_WINDOW = 160; // 20 ms
const BEAT_MIN_STRENGTH = 0.3;
const BEAT_MIN_GAP_SECONDS = 0.12;
const HIT_TIME_OFFSET_SECONDS = -0.005;

function findBassHits(samples) {
  const hopSeconds = BEAT_HOP / BEAT_RATE;
  const count = Math.floor(samples.length / BEAT_HOP);
  const envelope = new Float32Array(count);
  let sum = 0;
  const square = (i) => (i >= 0 && i < samples.length ? samples[i] * samples[i] : 0);
  for (let i = 0; i < BEAT_RMS_WINDOW / 2; i += 1) sum += square(i);
  for (let n = 0; n < count; n += 1) {
    // Window centred on n * BEAT_HOP.
    envelope[n] = Math.sqrt(Math.max(0, sum) / BEAT_RMS_WINDOW);
    for (let i = 0; i < BEAT_HOP; i += 1) {
      const centre = n * BEAT_HOP + i;
      sum += square(centre + BEAT_RMS_WINDOW / 2) - square(centre - BEAT_RMS_WINDOW / 2);
    }
  }
  const rise = new Float32Array(count);
  for (let n = 2; n < count; n += 1) rise[n] = Math.max(0, envelope[n] - envelope[n - 2]);

  const percentile = (values, q) => {
    const sorted = Float32Array.from(values).sort();
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  };
  // A floor from the whole track, so silence is not normalized up to a hit.
  const floor = 0.1 * percentile(rise, 0.995);
  const half = Math.round(4 / hopSeconds);
  const step = Math.round(0.5 / hopSeconds);
  const strength = new Float32Array(count);
  for (let start = 0; start < count; start += step) {
    const local = percentile(rise.subarray(Math.max(0, start - half), Math.min(count, start + half)), 0.98);
    const reference = Math.max(local, floor, 1e-9);
    for (let n = start; n < Math.min(count, start + step); n += 1) strength[n] = Math.min(1, rise[n] / reference);
  }

  const candidates = [];
  for (let n = 1; n < count - 1; n += 1) {
    if (strength[n] >= BEAT_MIN_STRENGTH && rise[n] >= rise[n - 1] && rise[n] > rise[n + 1]) candidates.push(n);
  }
  // Strongest first; a hit removes weaker candidates too close to it.
  candidates.sort((a, b) => rise[b] - rise[a]);
  const gap = Math.round(BEAT_MIN_GAP_SECONDS / hopSeconds);
  const taken = new Uint8Array(count);
  const hits = [];
  for (const n of candidates) {
    if (taken[n]) continue;
    hits.push({ seconds: Math.max(0, n * hopSeconds + HIT_TIME_OFFSET_SECONDS), strength: strength[n] });
    for (let k = Math.max(0, n - gap); k <= Math.min(count - 1, n + gap); k += 1) taken[k] = 1;
  }
  return hits.sort((a, b) => a.seconds - b.seconds);
}

function writeBeats() {
  const chunks = [];
  const band = spawn('ffmpeg', ['-v', 'error', '-i', input, '-af', 'highpass=f=35,highpass=f=35,lowpass=f=140,lowpass=f=140',
    '-f', 'f32le', '-ac', '1', '-ar', String(BEAT_RATE), 'pipe:1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  band.stdout.on('data', (chunk) => chunks.push(chunk));
  band.on('close', (code) => {
    if (code !== 0) {
      console.error(`ffmpeg failed with code ${code}`);
      process.exit(1);
    }
    const bytes = Buffer.concat(chunks);
    const samples = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4));
    const hits = findBassHits(samples);
    // "OMBT", hit count (uint32), then per hit: seconds and strength (float32).
    const body = Buffer.alloc(8 + hits.length * 8);
    body.write('OMBT', 0, 'ascii');
    body.writeUInt32LE(hits.length, 4);
    hits.forEach((hit, index) => {
      body.writeFloatLE(hit.seconds, 8 + index * 8);
      body.writeFloatLE(hit.strength, 12 + index * 8);
    });
    const beatsOutput = input.replace(/\.[^.]+$/, '.beats');
    writeFileSync(beatsOutput, body);
    const strong = hits.filter((hit) => hit.strength >= 0.7).length;
    console.log(`${beatsOutput}: ${hits.length} bass hits (${strong} at strength 0.7 or more), ${body.length} bytes`);
  });
}
