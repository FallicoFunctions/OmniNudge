/** Lossless delivery copies. Run on every build so revisions cannot go stale. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root, 'public/assets/avatars/complete-pair');
const manifest = {};
for (const character of ['male', 'female']) for (const suffix of ['', '-lod1', '-lod2']) {
  const file = `${character}${suffix}.glb`;
  const raw = await fs.readFile(path.join(assets, file));
  const compressed = gzipSync(raw, { level: 9 });
  assert.deepEqual(gunzipSync(compressed), raw, `${file}: lossless round trip`);
  await fs.writeFile(path.join(assets, file + '.gz'), compressed);
  manifest[file] = { bytes: raw.length, gzipBytes: compressed.length, sha256: createHash('sha256').update(raw).digest('hex') };
  console.log(`${file}: ${(raw.length/1048576).toFixed(1)} → ${(compressed.length/1048576).toFixed(1)} MiB (lossless)`);
}
await fs.writeFile(path.join(root, 'src/player/completeAvatarDownloads.json'), JSON.stringify(manifest, null, 2) + '\n');
