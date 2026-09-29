import downloads from './completeAvatarDownloads.json';

const base = '/assets/avatars/complete-pair/';

/** Decode the smaller transport copy; older browsers retain the ordinary GLB. */
export async function loadCompleteAvatarSource(file: string): Promise<string | Uint8Array> {
  if (!Object.hasOwn(downloads, file)) throw new Error('Unknown complete avatar asset.');
  const asset = downloads[file as keyof typeof downloads];
  const revision = `?v=${asset.sha256.slice(0, 16)}`;
  const fallback = file + revision;
  if (typeof DecompressionStream === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) return fallback;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(base + file + '.gz' + revision, { signal: controller.signal });
    if (!response.ok) return fallback;
    let bytes = new Uint8Array(await response.arrayBuffer());
    // Some static hosts set Content-Encoding:gzip on .gz files, so fetch has
    // already decoded them. Detect the payload before trying a second decode.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream()
        .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
    if (bytes.length !== asset.bytes) return fallback;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return hash === asset.sha256 ? bytes : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
