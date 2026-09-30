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
// The beats file lists every hit in three bands (bass, mids, highs) with its
// time and a strength from 0 to 1 (see findHits).
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
// Loudness: the mean power of the mono mix in each LOUDNESS_BLOCK_SECONDS,
// stored in the beats file (the lights' energy follows it, as a waveform
// view of the track would show its peaks and valleys).
const LOUDNESS_BLOCK_SECONDS = 0.25;
const loudnessBlock = SAMPLE_RATE * LOUDNESS_BLOCK_SECONDS;
const loudness = [];
let loudnessSum = 0;
analyse(); // Frame 0: the time before the first sample.
ffmpeg.stdout.on('data', (chunk) => {
  const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
  const usable = data.length - (data.length % 8);
  for (let offset = 0; offset < usable; offset += 8) {
    // The Web Audio "speakers" downmix of stereo to mono: (L + R) / 2.
    const mono = (data.readFloatLE(offset) + data.readFloatLE(offset + 4)) / 2;
    ring[ringIndex] = mono;
    ringIndex = (ringIndex + 1) % FFT_SIZE;
    sampleCount += 1;
    loudnessSum += mono * mono;
    if (sampleCount % loudnessBlock === 0) {
      loudness.push(loudnessSum / loudnessBlock);
      loudnessSum = 0;
    }
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
  writeBeats().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
});

// ---- hits ---------------------------------------------------------------
//
// A loud club master keeps every band of the spectrum near its ceiling, so
// the lights cannot find the hits from the spectrum level (the old punch
// detector fired about once in two minutes on this set). The hits are found
// here instead, per band, at 5 ms resolution:
//   1. ffmpeg band-passes the band and resamples to mono.
//   2. RMS envelope: 20 ms window, 5 ms hop.
//   3. Rise: how much the envelope grew over 10 ms (0 when it fell).
//   4. Strength: the rise divided by the 98th percentile of the rise within
//      4 s each side, so a quiet section is judged against itself. In the
//      bass band 1 is a full kick; bass notes between kicks come out lower.
//   5. A hit is a local maximum of strength over MIN_STRENGTH, at least the
//      band's minimum gap from a stronger one.
// offsetSeconds moves the reported time from the rise's maximum to the start
// of the sound, measured per band on synthetic hits at known times: a kick's
// maximum came 5 ms after its start; a snare or hat burst's came on it.
//
// The bands: bass 35-140 Hz (kicks, bass notes); mids 2-8 kHz (snares,
// claps); highs over 8 kHz (hats, cymbals). They match the three bands the
// lights split the spectrum into.
const HOP_SECONDS = 0.005;
const MIN_STRENGTH = 0.3;
const BANDS = [
  { name: 'bass', rate: 8000, filter: 'highpass=f=35,highpass=f=35,lowpass=f=140,lowpass=f=140', minGapSeconds: 0.12, offsetSeconds: -0.005 },
  { name: 'mids', rate: 24000, filter: 'highpass=f=2000,highpass=f=2000,lowpass=f=8000,lowpass=f=8000', minGapSeconds: 0.1, offsetSeconds: 0 },
  { name: 'highs', rate: 48000, filter: 'highpass=f=8000,highpass=f=8000', minGapSeconds: 0.1, offsetSeconds: 0 },
];

// Energy (sum of squares) of each 5 ms block of the band, read as a stream:
// a two-hour band at 48 kHz does not fit in memory as samples.
function bandEnergy(band) {
  return new Promise((resolve, reject) => {
    const hop = Math.round(band.rate * HOP_SECONDS);
    const blocks = [];
    let sum = 0;
    let filled = 0;
    let leftover = Buffer.alloc(0);
    const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-i', input, '-af', band.filter, '-f', 'f32le', '-ac', '1',
      '-ar', String(band.rate), 'pipe:1'], { stdio: ['ignore', 'pipe', 'inherit'] });
    ffmpeg.stdout.on('data', (chunk) => {
      const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      const usable = data.length - (data.length % 4);
      for (let offset = 0; offset < usable; offset += 4) {
        const sample = data.readFloatLE(offset);
        sum += sample * sample;
        filled += 1;
        if (filled === hop) {
          blocks.push(sum);
          sum = 0;
          filled = 0;
        }
      }
      leftover = data.subarray(usable);
    });
    ffmpeg.on('close', (code) => (code === 0 ? resolve({ energy: Float64Array.from(blocks), hop }) : reject(new Error(`ffmpeg failed with code ${code}`))));
  });
}

function findHits({ energy, hop }, { minGapSeconds, offsetSeconds }) {
  const count = energy.length;
  // 20 ms RMS centred on the start of block n: blocks n-2 .. n+1.
  const envelope = new Float32Array(count);
  for (let n = 0; n < count; n += 1) {
    let sum = 0;
    for (let k = n - 2; k <= n + 1; k += 1) sum += k >= 0 && k < count ? energy[k] : 0;
    envelope[n] = Math.sqrt(sum / (4 * hop));
  }
  const rise = new Float32Array(count);
  for (let n = 2; n < count; n += 1) rise[n] = Math.max(0, envelope[n] - envelope[n - 2]);

  const percentile = (values, q) => {
    const sorted = Float32Array.from(values).sort();
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  };
  // A floor from the whole track, so silence is not normalized up to a hit.
  const floor = 0.1 * percentile(rise, 0.995);
  const half = Math.round(4 / HOP_SECONDS);
  const step = Math.round(0.5 / HOP_SECONDS);
  const strength = new Float32Array(count);
  for (let start = 0; start < count; start += step) {
    const local = percentile(rise.subarray(Math.max(0, start - half), Math.min(count, start + half)), 0.98);
    const reference = Math.max(local, floor, 1e-9);
    for (let n = start; n < Math.min(count, start + step); n += 1) strength[n] = Math.min(1, rise[n] / reference);
  }

  const candidates = [];
  for (let n = 1; n < count - 1; n += 1) {
    if (strength[n] >= MIN_STRENGTH && rise[n] >= rise[n - 1] && rise[n] > rise[n + 1]) candidates.push(n);
  }
  // Strongest first; a hit removes weaker candidates too close to it.
  candidates.sort((a, b) => rise[b] - rise[a]);
  const gap = Math.round(minGapSeconds / HOP_SECONDS);
  const taken = new Uint8Array(count);
  const hits = [];
  for (const n of candidates) {
    if (taken[n]) continue;
    hits.push({ seconds: Math.max(0, n * HOP_SECONDS + offsetSeconds), strength: strength[n] });
    for (let k = Math.max(0, n - gap); k <= Math.min(count - 1, n + gap); k += 1) taken[k] = 1;
  }
  return hits.sort((a, b) => a.seconds - b.seconds);
}

async function writeBeats() {
  const lists = [];
  for (const band of BANDS) lists.push(findHits(await bandEnergy(band), band));
  // "OMB3", one hit count per band and the loudness block count (uint32),
  // then the bands in order, per hit: seconds and strength (float32), then
  // the mean power of each 0.25 s block (float32).
  const total = lists.reduce((sum, hits) => sum + hits.length, 0);
  const header = 4 + 4 * (BANDS.length + 1);
  const body = Buffer.alloc(header + total * 8 + loudness.length * 4);
  body.write('OMB3', 0, 'ascii');
  lists.forEach((hits, band) => body.writeUInt32LE(hits.length, 4 + 4 * band));
  body.writeUInt32LE(loudness.length, 4 + 4 * BANDS.length);
  let offset = header;
  for (const hits of lists) {
    for (const hit of hits) {
      body.writeFloatLE(hit.seconds, offset);
      body.writeFloatLE(hit.strength, offset + 4);
      offset += 8;
    }
  }
  for (const power of loudness) {
    body.writeFloatLE(power, offset);
    offset += 4;
  }
  const beatsOutput = input.replace(/\.[^.]+$/, '.beats');
  writeFileSync(beatsOutput, body);
  const summary = lists.map((hits, band) => `${BANDS[band].name} ${hits.length}`).join(', ');
  const kicks = lists[0].filter((hit) => hit.strength >= 0.7).length;
  console.log(`${beatsOutput}: hits ${summary} (${kicks} bass hits at strength 0.7 or more), ${body.length} bytes`);
}
