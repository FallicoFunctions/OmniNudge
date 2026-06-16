import { describe, expect, it } from 'vitest';

import { classifyPlatformExternalUrl } from '../platformExternalProviders';
import { getPlatformExternalEmbed } from '../platformExternalEmbeds';

describe('classifyPlatformExternalUrl', () => {
  it('classifies a YouTube short URL as youtube', () => {
    const result = classifyPlatformExternalUrl('https://youtu.be/dQw4w9WgXcQ');

    expect(result?.id).toBe('youtube');
  });

  it('marks TikTok URLs as supported embeds', () => {
    const result = classifyPlatformExternalUrl(
      'https://www.tiktok.com/@example/video/1234567890123456789'
    );

    expect(result?.status).toBe('supported_embed');
  });

  it('marks Instagram reel URLs as recognized but disabled', () => {
    const result = classifyPlatformExternalUrl('https://www.instagram.com/reel/C4abc123XYZ/');

    expect(result?.id).toBe('instagram_reel');
    expect(result?.status).toBe('recognized_but_disabled');
  });

  it('falls back to render_no_media for Pornhub video URLs', () => {
    const result = classifyPlatformExternalUrl(
      'https://www.pornhub.com/view_video.php?viewkey=ph5f1234567890' // gitleaks:allow
    );

    expect(result?.id).toBe('pornhub');
    expect(result?.fallbackBehavior).toBe('render_no_media');
  });

  it('normalizes x.com and twitter.com to the same provider id', () => {
    expect(classifyPlatformExternalUrl('https://x.com/nasa/status/1')?.id).toBe('x_twitter_status');
    expect(classifyPlatformExternalUrl('https://twitter.com/nasa/status/1')?.id).toBe(
      'x_twitter_status'
    );
  });

  it('returns null for plain article URLs', () => {
    expect(
      classifyPlatformExternalUrl(
        'https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html'
      )
    ).toBeNull();
  });
});

describe('getPlatformExternalEmbed', () => {
  it('builds embeds for supported providers from the shared classifier', () => {
    expect(getPlatformExternalEmbed('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('returns null for recognized-but-disabled providers', () => {
    expect(getPlatformExternalEmbed('https://www.instagram.com/reel/C4abc123XYZ/')).toBeNull();
  });
});
