import { sanitizeHttpUrl } from './crosspostHelpers';
import { classifyPlatformExternalUrl } from './platformExternalProviders';

export type PlatformExternalEmbed =
  | { kind: 'iframe'; src: string }
  | { kind: 'video'; src: string };

function extractMatch(url: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function getYouTubeEmbed(url: string): string | null {
  const videoId = extractMatch(url, [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  ]);
  if (!videoId) {
    return null;
  }

  const startValue = (() => {
    try {
      const value = new URL(url).searchParams.get('t');
      return value ? parseInt(value, 10) : null;
    } catch {
      return null;
    }
  })();

  return `https://www.youtube-nocookie.com/embed/${videoId}${
    startValue && !Number.isNaN(startValue) ? `?start=${startValue}` : ''
  }`;
}

function getVimeoEmbed(url: string): string | null {
  const videoId = extractMatch(url, [/vimeo\.com\/(?:video\/)?([0-9]+)/i]);
  return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
}

function getTiktokEmbed(url: string): string | null {
  const videoId = extractMatch(url, [/tiktok\.com\/(?:@[^/]+\/video\/|v\/)([0-9]+)/i]);
  return videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : null;
}

function getTwitchEmbed(url: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const clipId = extractMatch(url, [/twitch\.tv\/(?:[^/]+)\/clip\/([A-Za-z0-9]+)/i]);
  if (clipId) {
    return `https://player.twitch.tv/?clip=${clipId}&parent=${window.location.hostname}`;
  }

  const videoId = extractMatch(url, [/twitch\.tv\/videos\/([0-9]+)/i]);
  return videoId ? `https://player.twitch.tv/?video=${videoId}&parent=${window.location.hostname}` : null;
}

function getDailymotionEmbed(url: string): string | null {
  const videoId = extractMatch(url, [
    /dailymotion\.com\/video\/([A-Za-z0-9]+)/i,
    /dai\.ly\/([A-Za-z0-9]+)/i,
  ]);
  return videoId ? `https://www.dailymotion.com/embed/video/${videoId}` : null;
}

function getStreamableEmbed(url: string): string | null {
  const videoId = extractMatch(url, [/streamable\.com\/(?:e\/)?([a-z0-9]+)/i]);
  return videoId ? `https://streamable.com/e/${videoId}` : null;
}

function getRedgifsEmbed(url: string): string | null {
  const videoId = extractMatch(url, [/redgifs\.com\/(?:watch|ifr)\/([A-Za-z0-9_-]+)/i]);
  return videoId ? `https://www.redgifs.com/ifr/${videoId}` : null;
}

function getGfycatEmbed(url: string): string | null {
  const videoId = extractMatch(url, [/gfycat\.com\/([A-Za-z0-9_-]+)/i]);
  return videoId ? `https://www.redgifs.com/ifr/${videoId}` : null;
}

function getGiphyEmbed(url: string): string | null {
  const mediaId = extractMatch(url, [/giphy\.com\/gifs\/[^/]*-?([A-Za-z0-9]+)$/i]);
  return mediaId ? `https://giphy.com/embed/${mediaId}` : null;
}

function getTenorEmbed(url: string): string | null {
  const mediaId = extractMatch(url, [/tenor\.com\/view\/[^/-]+-([a-z0-9]+)$/i]);
  return mediaId ? `https://tenor.com/embed/${mediaId}` : null;
}

function getImgurVideo(url: string): string | null {
  const mediaId = extractMatch(url, [/i\.imgur\.com\/([A-Za-z0-9]+)\.(?:gifv|gif)/i]);
  return mediaId ? `https://i.imgur.com/${mediaId}.mp4` : null;
}

export function getPlatformExternalEmbed(rawUrl?: string | null): PlatformExternalEmbed | null {
  const sanitizedUrl = sanitizeHttpUrl(rawUrl);
  if (!sanitizedUrl) {
    return null;
  }

  const provider = classifyPlatformExternalUrl(sanitizedUrl);
  if (!provider || provider.status !== 'supported_embed' || !provider.embedBuilderKey) {
    return null;
  }

  switch (provider.embedBuilderKey) {
    case 'youtube': {
      const src = getYouTubeEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'vimeo': {
      const src = getVimeoEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'tiktok': {
      const src = getTiktokEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'twitch': {
      const src = getTwitchEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'dailymotion': {
      const src = getDailymotionEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'streamable': {
      const src = getStreamableEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'redgifs': {
      const src = getRedgifsEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'gfycat': {
      const src = getGfycatEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'giphy': {
      const src = getGiphyEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'tenor': {
      const src = getTenorEmbed(sanitizedUrl);
      return src ? { kind: 'iframe', src } : null;
    }
    case 'imgur_gifv': {
      const src = getImgurVideo(sanitizedUrl);
      return src ? { kind: 'video', src } : null;
    }
    default:
      return null;
  }
}
