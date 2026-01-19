import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatTimestamp } from '../../utils/timeFormat';
import { FlairBadge } from './FlairBadge';
import {
  getDisplayDomain,
  isRedditDomain,
  sanitizeHttpUrl,
  type RedditCrosspostSource,
} from '../../utils/crosspostHelpers';
import { decodeHtmlEntities } from '../../utils/text';
import { loadHls } from '../../utils/hlsLoader';
import { redditService } from '../../services/redditService';

interface RedditPostCardProps {
  post: RedditCrosspostSource & {
    id: string;
    title: string;
    author: string;
    subreddit: string;
    score: number;
    num_comments: number;
    created_utc: number;
    thumbnail?: string;
    url?: string;
    selftext?: string;
    is_self: boolean;
    post_hint?: string;
    is_video?: boolean;
  };
  useRelativeTime: boolean;
  isSaved?: boolean;
  isSaveActionPending?: boolean;
  pendingShouldSave?: boolean;
  onShare?: () => void;
  onToggleSave?: (shouldSave: boolean) => void;
  onHide?: () => void;
  onCrosspost?: () => void;
  hideLabel?: string;
  linkState?: unknown;
}

const IMAGE_URL_REGEX = /\.(jpe?g|png|gif|webp)$/i;

function getExpandableImageUrl(post: RedditPostCardProps['post']): string | undefined {
  // Gallery posts are handled separately, don't return thumbnail as preview
  const isGalleryPost = post.url?.includes('/gallery/');
  if (isGalleryPost) {
    return undefined;
  }

  // Check for regular image preview
  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) {
    return sanitizedPreview;
  }

  // Check direct image URL
  const sanitizedPostUrl = sanitizeHttpUrl(post.url);
  if (!sanitizedPostUrl) {
    return undefined;
  }

  if (post.post_hint === 'image' || IMAGE_URL_REGEX.test(sanitizedPostUrl.toLowerCase())) {
    return sanitizedPostUrl;
  }

  return undefined;
}

function getThumbnailUrl(post: RedditPostCardProps['post']): string | null {
  const sanitizedThumbnail = sanitizeHttpUrl(post.thumbnail);
  if (sanitizedThumbnail) {
    return sanitizedThumbnail;
  }

  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) {
    return sanitizedPreview;
  }

  const oembedThumbnail =
    sanitizeHttpUrl(post.media?.oembed?.thumbnail_url) ??
    sanitizeHttpUrl(post.secure_media?.oembed?.thumbnail_url);
  if (oembedThumbnail) {
    return oembedThumbnail;
  }

  return null;
}

function getRedgifsId(url?: string | null): string | null {
  if (!url) return null;
  const normalized = url.toLowerCase();
  if (!normalized.includes('redgifs.com')) return null;
  const match = url.match(/redgifs\.com\/(?:watch|ifr)\/([a-zA-Z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function getImgurMp4(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/i\.imgur\.com\/([a-zA-Z0-9]+)\.(?:gifv|gif)/i);
  if (match?.[1]) {
    return `https://i.imgur.com/${match[1]}.mp4`;
  }
  return null;
}

function getGiphyEmbed(url?: string | null): { iframeSrc?: string; mp4Src?: string } | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('media.giphy.com/media/')) {
    const idMatch = url.match(/media\.giphy\.com\/media\/([^/]+)\//i);
    if (idMatch?.[1]) {
      return {
        mp4Src: `https://media.giphy.com/media/${idMatch[1]}/giphy.mp4`,
      };
    }
  }
  if (lower.includes('giphy.com/gifs/')) {
    const idMatch = url.match(/giphy\.com\/gifs\/[^/]*-?([a-zA-Z0-9]+)$/i);
    if (idMatch?.[1]) {
      return {
        iframeSrc: `https://giphy.com/embed/${idMatch[1]}`,
        mp4Src: `https://media.giphy.com/media/${idMatch[1]}/giphy.mp4`,
      };
    }
  }
  return null;
}

function getTenorMedia(url?: string | null): { iframeSrc?: string; mp4Src?: string } | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (!lower.includes('tenor.com') && !lower.includes('media.tenor.com')) return null;

  // Tenor short links: tenor.com/view/<slug>-<id>
  const slugMatch = url.match(/tenor\.com\/view\/[^/-]+-([a-z0-9]+)$/i);
  if (slugMatch?.[1]) {
    const id = slugMatch[1];
    return {
      iframeSrc: `https://tenor.com/embed/${id}`,
      // MP4 URLs from Tenor CDN sometimes end with .mp4 on media.tenor.com
      mp4Src: `https://media.tenor.com/${id}/AAAJ/${id}.mp4`,
    };
  }

  // Direct media.tenor.com links may already be MP4/GIF
  if (lower.includes('media.tenor.com')) {
    return { mp4Src: url };
  }

  return null;
}

function getStreamableEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i);
  return match?.[1] ? `https://streamable.com/e/${match[1]}` : null;
}

function getGfycatToRedgifs(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/gfycat\.com\/([a-zA-Z0-9_-]+)/i);
  return match?.[1] ? `https://www.redgifs.com/ifr/${match[1]}` : null;
}

function getYouTubeEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  const id = match?.[1];
  if (!id) return null;

  const startMatch = url.match(/[?&]t=([0-9]+)s?/);
  const start = startMatch?.[1];
  return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
}

function getVimeoEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
  return match?.[1] ? `https://player.vimeo.com/video/${match[1]}` : null;
}

function getSpotifyEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/i);
  if (!match) return null;
  const [, type, id] = match;
  return `https://open.spotify.com/embed/${type}/${id}`;
}

function getSoundCloudOEmbedHtml(url?: string | null): string | null {
  if (!url) return null;
  if (!url.toLowerCase().includes('soundcloud.com')) return null;
  // SoundCloud requires oEmbed; use iframe fallback with player endpoint
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&inverse=false&auto_play=false&show_user=true`;
}

function getAppleMusicEmbed(url?: string | null): string | null {
  if (!url) return null;
  if (!url.toLowerCase().includes('music.apple.com') && !url.toLowerCase().includes('podcasts.apple.com')) {
    return null;
  }
  return `https://embed.music.apple.com${url.substring(url.indexOf('.com') + 4)}`;
}

function getMixcloudEmbed(url?: string | null): string | null {
  if (!url) return null;
  if (!url.toLowerCase().includes('mixcloud.com')) return null;
  return `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(url)}`;
}

function getBandcampEmbed(url?: string | null): string | null {
  if (!url) return null;
  if (!url.toLowerCase().includes('bandcamp.com')) return null;
  // Bandcamp embeds differ by type; use the generic embed endpoint
  return `https://bandcamp.com/EmbeddedPlayer/${encodeURIComponent(url)}&size=large/bgcol=ffffff/linkcol=0687f5`;
}

function getTwitchEmbed(url?: string | null): string | null {
  if (!url) return null;
  const clipMatch = url.match(/twitch\.tv\/(?:[^/]+)\/clip\/([a-zA-Z0-9]+)/i);
  if (clipMatch?.[1]) {
    return `https://player.twitch.tv/?clip=${clipMatch[1]}&parent=${window.location.hostname}`;
  }
  const vodMatch = url.match(/twitch\.tv\/videos\/([0-9]+)/i);
  if (vodMatch?.[1]) {
    return `https://player.twitch.tv/?video=${vodMatch[1]}&parent=${window.location.hostname}`;
  }
  return null;
}

function getDailymotionEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/i);
  return match?.[1] ? `https://www.dailymotion.com/embed/video/${match[1]}` : null;
}

function getLoomEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/loom\.com\/share\/([a-f0-9-]+)/i);
  return match?.[1] ? `https://www.loom.com/embed/${match[1]}` : null;
}

function getTiktokEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/tiktok\.com\/(?:@[^/]+\/video\/|v\/)([0-9]+)/i);
  return match?.[1] ? `https://www.tiktok.com/embed/v2/${match[1]}` : null;
}

function getWistiaEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/wistia\.(?:com|net)\/medias\/([a-zA-Z0-9]+)/i);
  return match?.[1] ? `https://fast.wistia.net/embed/iframe/${match[1]}` : null;
}

type InlineMedia =
  | { kind: 'redgifs'; src: string }
  | { kind: 'iframe'; src: string }
  | { kind: 'video'; src: string }
  | { kind: 'audio'; src: string; title?: string };

type RedditVideoSource = { url: string; kind: 'mp4' | 'hls'; hasAudio: boolean };

function getInlineMedia(url?: string | null): InlineMedia | null {
  const sanitizedUrl = sanitizeHttpUrl(url);
  const redgifsId = getRedgifsId(sanitizedUrl);
  if (redgifsId) {
    return { kind: 'redgifs', src: `https://www.redgifs.com/ifr/${redgifsId}` };
  }

  const imgurMp4 = getImgurMp4(sanitizedUrl);
  if (imgurMp4) {
    return { kind: 'video', src: imgurMp4 };
  }

  const giphy = getGiphyEmbed(sanitizedUrl);
  if (giphy?.mp4Src) {
    return { kind: 'video', src: giphy.mp4Src };
  }
  if (giphy?.iframeSrc) {
    return { kind: 'iframe', src: giphy.iframeSrc };
  }

  const tenor = getTenorMedia(sanitizedUrl);
  if (tenor?.mp4Src) {
    return { kind: 'video', src: tenor.mp4Src };
  }
  if (tenor?.iframeSrc) {
    return { kind: 'iframe', src: tenor.iframeSrc };
  }

  const streamableEmbed = getStreamableEmbed(sanitizedUrl);
  if (streamableEmbed) {
    return { kind: 'iframe', src: streamableEmbed };
  }

  const gfyToRedgifs = getGfycatToRedgifs(sanitizedUrl);
  if (gfyToRedgifs) {
    return { kind: 'redgifs', src: gfyToRedgifs };
  }

  const youtube = getYouTubeEmbed(sanitizedUrl);
  if (youtube) {
    return { kind: 'iframe', src: youtube };
  }

  const vimeo = getVimeoEmbed(sanitizedUrl);
  if (vimeo) {
    return { kind: 'iframe', src: vimeo };
  }

  const spotify = getSpotifyEmbed(sanitizedUrl);
  if (spotify) {
    return { kind: 'iframe', src: spotify };
  }

  const soundcloud = getSoundCloudOEmbedHtml(sanitizedUrl);
  if (soundcloud) {
    return { kind: 'iframe', src: soundcloud };
  }

  const apple = getAppleMusicEmbed(sanitizedUrl);
  if (apple) {
    return { kind: 'iframe', src: apple };
  }

  const mixcloud = getMixcloudEmbed(sanitizedUrl);
  if (mixcloud) {
    return { kind: 'iframe', src: mixcloud };
  }

  const bandcamp = getBandcampEmbed(sanitizedUrl);
  if (bandcamp) {
    return { kind: 'iframe', src: bandcamp };
  }

  const twitch = getTwitchEmbed(sanitizedUrl);
  if (twitch) {
    return { kind: 'iframe', src: twitch };
  }

  const dailymotion = getDailymotionEmbed(sanitizedUrl);
  if (dailymotion) {
    return { kind: 'iframe', src: dailymotion };
  }

  const loom = getLoomEmbed(sanitizedUrl);
  if (loom) {
    return { kind: 'iframe', src: loom };
  }

  const tiktok = getTiktokEmbed(sanitizedUrl);
  if (tiktok) {
    return { kind: 'iframe', src: tiktok };
  }

  const wistia = getWistiaEmbed(sanitizedUrl);
  if (wistia) {
    return { kind: 'iframe', src: wistia };
  }

  return null;
}

function getRedditVideoSource(post: RedditPostCardProps['post']): RedditVideoSource | null {
  const video = post.secure_media?.reddit_video || post.media?.reddit_video;
  if (!video) return null;

  if (video.fallback_url) {
    return { url: video.fallback_url, hasAudio: Boolean(video.has_audio ?? true), kind: 'mp4' };
  }

  if (video.hls_url) {
    return { url: video.hls_url, hasAudio: true, kind: 'hls' };
  }

  return null;
}

export function RedditPostCard({
  post,
  useRelativeTime,
  isSaved = false,
  isSaveActionPending = false,
  pendingShouldSave = false,
  onShare,
  onToggleSave,
  onHide,
  onCrosspost,
  hideLabel = 'Hide',
  linkState,
}: RedditPostCardProps) {
  const [expandedImageMap, setExpandedImageMap] = useState<Record<string, boolean>>({});
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const isGalleryPost = post.url?.includes('/gallery/');

  const toggleInlinePreview = async (postId: string) => {
    // For gallery posts, fetch images from API
    if (isGalleryPost) {
      const isCurrentlyExpanded = expandedImageMap[postId];

      if (!isCurrentlyExpanded) {
        // Expanding - fetch gallery images
        setIsLoadingGallery(true);
        try {
          const images = await redditService.getPostGalleryImages(post.subreddit, post.id);
          setGalleryImages(images);
        } catch (error) {
          console.error('Failed to fetch gallery images:', error);
          setGalleryImages([]);
        } finally {
          setIsLoadingGallery(false);
        }
      }
    }

    setExpandedImageMap((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const postUrl = `/r/${post.subreddit}/comments/${post.id}`;
  const thumbnail = getThumbnailUrl(post);
  const sanitizedExternalUrl = sanitizeHttpUrl(post.url);
  const externalDomain = getDisplayDomain(sanitizedExternalUrl);
  const isExternalLink = Boolean(
    sanitizedExternalUrl && externalDomain && !isRedditDomain(externalDomain)
  );
  const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
  const previewImageUrl = getExpandableImageUrl(post);
  const inlineMedia = getInlineMedia(sanitizedExternalUrl);
  const redditVideoSource = getRedditVideoSource(post);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasSelftext = Boolean(post.selftext && post.selftext.trim());
  const hasInlineMedia = Boolean(isGalleryPost || previewImageUrl || inlineMedia || redditVideoSource || hasSelftext);
  const isInlinePreviewOpen = !!(hasInlineMedia && expandedImageMap[post.id]);

  useEffect(() => {
    if (!redditVideoSource || redditVideoSource.kind !== 'hls') return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const canNativePlay = videoEl.canPlayType('application/vnd.apple.mpegurl');
    if (canNativePlay) {
      videoEl.src = redditVideoSource.url;
      return;
    }

    let hlsInstance: { destroy: () => void } | null = null;
    let mounted = true;
    (async () => {
      try {
        const Hls = await loadHls();
        if (Hls?.isSupported && Hls.isSupported()) {
          const instance = new Hls();
          instance.loadSource(redditVideoSource.url);
          instance.attachMedia(videoEl);
          if (mounted) {
            hlsInstance = instance;
          } else {
            instance.destroy();
          }
        } else {
          console.warn('HLS not supported and no fallback available.');
        }
      } catch (err) {
        console.error('Failed to load HLS player for playback', err);
      }
    })();

    return () => {
      mounted = false;
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [redditVideoSource]);

  return (
    <article
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
      style={{
        transform: 'translate3d(0,0,0)',
        WebkitTransform: 'translate3d(0,0,0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      } as React.CSSProperties}
    >
      <div className="flex gap-3 p-3">
        {thumbnail && (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-14 w-14 flex-shrink-0 rounded object-cover"
          />
        )}
        <div className="flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            {isExternalLink ? (
              <a
                href={sanitizedExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                {decodeHtmlEntities(post.title)}
              </a>
            ) : (
              <Link
                to={postUrl}
                state={linkState}
                className="flex-1 text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                {decodeHtmlEntities(post.title)}
              </Link>
            )}
        <FlairBadge
          text={decodeHtmlEntities(post.link_flair_text)}
              backgroundColor={post.link_flair_background_color}
              textColor={post.link_flair_text_color}
            />
            {post.stickied && (
              <div
                className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800 dark:bg-green-900/30 dark:text-green-400"
                title="Pinned by moderators"
              >
                <svg
                  className="h-3 w-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                </svg>
                Pinned
              </div>
            )}
            {isExternalLink && (
              <a
                href={sanitizedExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {externalDomain ?? 'external'}
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            )}
          </div>
          <div className="mt-1 flex items-start gap-3 text-[11px] text-[var(--color-text-secondary)]">
            {hasInlineMedia && (
              <button
                type="button"
                onClick={() => toggleInlinePreview(post.id)}
                aria-pressed={!!expandedImageMap[post.id]}
                aria-label={isInlinePreviewOpen ? 'Hide image preview' : 'Show image preview'}
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                <span className="sr-only">
                  {isInlinePreviewOpen ? 'Hide image preview' : 'Show image preview'}
                </span>
                {isInlinePreviewOpen ? (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
                  </svg>
                )}
              </button>
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/r/${post.subreddit}`}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  r/{post.subreddit}
                </Link>
                <span>•</span>
                <Link
                  to={`/user/${post.author}`}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  u/{post.author}
                </Link>
                <span>•</span>
                <span>{post.score.toLocaleString()} points</span>
                <span>•</span>
                <span>submitted {formatTimestamp(post.created_utc, useRelativeTime)}</span>
              </div>
              {expandedImageMap[post.id] && (
                <div className="mt-3 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                  {isGalleryPost ? (
                    isLoadingGallery ? (
                      <div className="flex items-center justify-center p-8 text-[var(--color-text-secondary)]">
                        Loading gallery images...
                      </div>
                    ) : galleryImages.length > 0 ? (
                      <div className="space-y-2 p-2">
                        {galleryImages.map((imageUrl, index) => (
                          <img
                            key={index}
                            src={imageUrl}
                            alt={`${post.title} - Image ${index + 1}`}
                            loading="lazy"
                            decoding="async"
                            className="max-h-[70vh] w-full object-contain"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-8 text-[var(--color-text-secondary)]">
                        No images found in this gallery
                      </div>
                    )
                  ) : redditVideoSource ? (
                    <div className="relative w-full bg-black">
                      <video
                        ref={videoRef}
                        controls
                        className="max-h-[70vh] w-full bg-black"
                        playsInline
                        preload="metadata"
                      >
                        {redditVideoSource.kind === 'mp4' && (
                          <source src={redditVideoSource.url} type="video/mp4" />
                        )}
                        {redditVideoSource.kind === 'hls' && (
                          <source src={redditVideoSource.url} type="application/vnd.apple.mpegurl" />
                        )}
                        Your browser does not support the video tag.
                      </video>
                      {!redditVideoSource.hasAudio && (
                        <div className="p-2 text-xs text-[var(--color-text-secondary)]">
                          Note: This video may not have audio.
                        </div>
                      )}
                    </div>
                  ) : inlineMedia?.kind === 'redgifs' ? (
                    <div className="relative w-full bg-black">
                      <iframe
                        title={`${post.title} - Redgifs video`}
                        src={inlineMedia.src}
                        className="h-[70vh] w-full"
                        frameBorder="0"
                        scrolling="no"
                        allow="fullscreen; picture-in-picture; autoplay"
                        loading="lazy"
                        allowFullScreen
                      />
                    </div>
                  ) : inlineMedia?.kind === 'iframe' ? (
                    <div className="relative w-full bg-black">
                      <iframe
                        title={`${post.title} - Embedded media`}
                        src={inlineMedia.src}
                        className="h-[70vh] w-full"
                        frameBorder="0"
                        scrolling="no"
                        allow="fullscreen; picture-in-picture; autoplay"
                        loading="lazy"
                        allowFullScreen
                      />
                    </div>
                  ) : inlineMedia?.kind === 'video' ? (
                    <video
                      src={inlineMedia.src}
                      className="max-h-[70vh] w-full bg-black"
                      controls
                      playsInline
                      loop
                      preload="metadata"
                    />
                  ) : previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt={post.title}
                      loading="lazy"
                      decoding="async"
                      className="max-h-[70vh] w-full object-contain"
                    />
                  ) : hasSelftext ? (
                    <div className="p-4 text-[var(--color-text-primary)]">
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <p className="whitespace-pre-wrap">{post.selftext}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3">
            <Link
              to={postUrl}
              state={linkState}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
            >
              {commentLabel}
            </Link>
                {onShare && (
                  <button
                    type="button"
                    onClick={onShare}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    Share
                  </button>
                )}
                {onToggleSave && (
                  <button
                    type="button"
                    onClick={() => onToggleSave(!isSaved)}
                    disabled={isSaveActionPending}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                  >
                    {isSaveActionPending
                      ? pendingShouldSave
                        ? 'Saving...'
                        : 'Unsaving...'
                      : isSaved
                      ? 'Unsave'
                      : 'Save'}
                  </button>
                )}
                {onHide && (
                  <button
                    type="button"
                    onClick={onHide}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    {hideLabel}
                  </button>
                )}
                {onCrosspost && (
                  <button
                    type="button"
                    onClick={onCrosspost}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    Crosspost
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
