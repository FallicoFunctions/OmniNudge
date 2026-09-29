// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { loadCompleteAvatarSource } from '../completeAvatarDownload';

vi.mock('../completeAvatarDownloads.json', async () => {
  const { createHash } = await import('node:crypto');
  const data = Buffer.from('glTF test transport bytes');
  return { default: { 'female.glb': { bytes: data.length, gzipBytes: 45,
    sha256: createHash('sha256').update(data).digest('hex') } } };
});
const data = Buffer.from('glTF test transport bytes');
const fallback = 'female.glb?v=' + createHash('sha256').update(data).digest('hex').slice(0, 16);
afterEach(() => { vi.unstubAllGlobals(); });

it.each([false, true])('loads identical bytes when HTTP decoding is %s', async decodedByHost => {
  vi.stubGlobal('crypto', webcrypto);
  const fetcher = vi.fn().mockResolvedValue(new Response(decodedByHost ? data : gzipSync(data)));
  vi.stubGlobal('fetch', fetcher);
  expect(await loadCompleteAvatarSource('female.glb')).toEqual(new Uint8Array(data));
  expect(fetcher.mock.calls[0][0]).toBe('/assets/avatars/complete-pair/female.glb.gz' + fallback.slice(fallback.indexOf('?')));
});

it.each(['missing', 'invalid gzip', 'wrong size', 'wrong hash', 'offline'])('falls back to the versioned GLB after %s', async failure => {
  vi.stubGlobal('crypto', webcrypto);
  const body = failure === 'invalid gzip' ? new Uint8Array([31,139,0,0])
    : failure === 'wrong hash' ? Buffer.from('glTF TEST transport bytes') : Buffer.from('bad');
  vi.stubGlobal('fetch', failure === 'offline' ? vi.fn().mockRejectedValue(new Error('offline'))
    : vi.fn().mockResolvedValue(new Response(body, { status: failure === 'missing' ? 404 : 200 })));
  expect(await loadCompleteAvatarSource('female.glb')).toBe(fallback);
});

it('uses the ordinary GLB without a second request on browsers lacking decompression', async () => {
  vi.stubGlobal('DecompressionStream', undefined);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  expect(await loadCompleteAvatarSource('female.glb')).toBe(fallback);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects paths outside the packaged avatar set', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(loadCompleteAvatarSource('../external.glb')).rejects.toThrow('Unknown');
  expect(fetcher).not.toHaveBeenCalled();
});
