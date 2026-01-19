export function getRedditDashAudioUrl(videoUrl?: string | null): string | undefined {
  if (!videoUrl) return undefined;

  try {
    const parsed = new URL(videoUrl);
    const segments = parsed.pathname.split('/');
    if (segments.length === 0) return undefined;
    segments[segments.length - 1] = 'DASH_audio.mp4';
    parsed.pathname = segments.join('/');
    return parsed.toString();
  } catch {
    const [base, query = ''] = videoUrl.split('?');
    const lastSlashIndex = base.lastIndexOf('/');
    if (lastSlashIndex <= 0) return undefined;
    const audioBase = `${base.substring(0, lastSlashIndex)}/DASH_audio.mp4`;
    return query ? `${audioBase}?${query}` : audioBase;
  }
}
