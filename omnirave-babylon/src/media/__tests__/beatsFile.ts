// Writes a beat file in the format src/media/trackBeats.ts reads ("OMB4"), for
// tests.

export type Hit = [seconds: number, strength: number];

export interface BeatsFileContent {
  bass?: Hit[];
  mids?: Hit[];
  highs?: Hit[];
  loudness?: number[];
  // Each beat's time; its count is its index unless `counts` gives one.
  beats?: number[];
  counts?: number[];
  // The index of each drop's beat.
  drops?: number[];
}

export function beatsFile(content: BeatsFileContent = {}): Uint8Array {
  const { bass = [], mids = [], highs = [], loudness = [], beats = [], counts, drops = [] } = content;
  const bands = [bass, mids, highs];
  const hits = bands.reduce((sum, band) => sum + band.length, 0);
  const bytes = new Uint8Array(28 + hits * 8 + loudness.length * 4 + beats.length * 8 + drops.length * 4);
  bytes.set([79, 77, 66, 52]); // "OMB4"
  const view = new DataView(bytes.buffer);
  bands.forEach((band, i) => view.setUint32(4 + 4 * i, band.length, true));
  view.setUint32(16, loudness.length, true);
  view.setUint32(20, beats.length, true);
  view.setUint32(24, drops.length, true);
  let offset = 28;
  for (const [seconds, strength] of bands.flat()) {
    view.setFloat32(offset, seconds, true);
    view.setFloat32(offset + 4, strength, true);
    offset += 8;
  }
  for (const power of loudness) {
    view.setFloat32(offset, power, true);
    offset += 4;
  }
  beats.forEach((seconds, i) => {
    view.setFloat32(offset, seconds, true);
    view.setUint32(offset + 4, counts ? counts[i] : i, true);
    offset += 8;
  });
  for (const beat of drops) {
    view.setUint32(offset, beat, true);
    offset += 4;
  }
  return bytes;
}
