import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GalleryImage } from '../../types/posts';
import { HlsVideo } from '../common/HlsVideo';
import { resolveMediaUrl } from '../../utils/mediaUrl';

type PostDetailMediaProps = {
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  galleryImages?: GalleryImage[];
  decodedTitle: string;
  isVideoMedia: boolean;
  imageExpanded: boolean;
  onToggleExpanded: () => void;
};

function getYouTubeEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (!match?.[1]) return null;
  const startMatch = url.match(/[?&]t=(\d+)/);
  const start = startMatch ? parseInt(startMatch[1], 10) : null;
  return `https://www.youtube-nocookie.com/embed/${match[1]}${start ? `?start=${start}` : ''}`;
}

function getVimeoEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
  return match?.[1] ? `https://player.vimeo.com/video/${match[1]}` : null;
}

function getTiktokEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/tiktok\.com\/(?:@[^/]+\/video\/|v\/)([0-9]+)/i);
  return match?.[1] ? `https://www.tiktok.com/embed/v2/${match[1]}` : null;
}

function getTwitchEmbed(url?: string | null): string | null {
  if (!url || typeof window === 'undefined') return null;
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

function getStreamableEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i);
  return match?.[1] ? `https://streamable.com/e/${match[1]}` : null;
}

function getRedgifsEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/redgifs\.com\/(?:watch|ifr)\/([a-zA-Z0-9_-]+)/i);
  if (match?.[1]) return `https://www.redgifs.com/ifr/${match[1]}`;
  const gfyMatch = url.match(/gfycat\.com\/([a-zA-Z0-9_-]+)/i);
  return gfyMatch?.[1] ? `https://www.redgifs.com/ifr/${gfyMatch[1]}` : null;
}

function getGiphyEmbed(url?: string | null): string | null {
  if (!url) return null;
  const idMatch = url.match(/giphy\.com\/gifs\/[^/]*-?([a-zA-Z0-9]+)$/i);
  return idMatch?.[1] ? `https://giphy.com/embed/${idMatch[1]}` : null;
}

function getTenorEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/tenor\.com\/view\/[^/-]+-([a-z0-9]+)$/i);
  return match?.[1] ? `https://tenor.com/embed/${match[1]}` : null;
}

function getImgurMp4(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/i\.imgur\.com\/([a-zA-Z0-9]+)\.(?:gifv|gif)/i);
  if (match?.[1]) {
    return `https://i.imgur.com/${match[1]}.mp4`;
  }
  return null;
}

type ExternalMedia = { kind: 'iframe'; src: string } | { kind: 'video'; src: string };

function getExternalVideoMedia(url?: string | null): ExternalMedia | null {
  if (!url) return null;

  const youtube = getYouTubeEmbed(url);
  if (youtube) return { kind: 'iframe', src: youtube };

  const vimeo = getVimeoEmbed(url);
  if (vimeo) return { kind: 'iframe', src: vimeo };

  const tiktok = getTiktokEmbed(url);
  if (tiktok) return { kind: 'iframe', src: tiktok };

  const twitch = getTwitchEmbed(url);
  if (twitch) return { kind: 'iframe', src: twitch };

  const dailymotion = getDailymotionEmbed(url);
  if (dailymotion) return { kind: 'iframe', src: dailymotion };

  const streamable = getStreamableEmbed(url);
  if (streamable) return { kind: 'iframe', src: streamable };

  const redgifs = getRedgifsEmbed(url);
  if (redgifs) return { kind: 'iframe', src: redgifs };

  const giphy = getGiphyEmbed(url);
  if (giphy) return { kind: 'iframe', src: giphy };

  const tenor = getTenorEmbed(url);
  if (tenor) return { kind: 'iframe', src: tenor };

  const imgurMp4 = getImgurMp4(url);
  if (imgurMp4) return { kind: 'video', src: imgurMp4 };

  return null;
}

function getEmbedSizing(url?: string | null): { className: string; style?: CSSProperties } {
  if (!url) {
    return { className: 'w-full aspect-video block' };
  }
  if (url.includes('tiktok.com')) {
    return {
      className: 'mx-auto block',
      style: {
        height: 'min(80vh, 720px)',
        aspectRatio: '9 / 16',
        width: 'auto',
        maxWidth: '100%',
      },
    };
  }
  return { className: 'w-full aspect-video block' };
}

export function PostDetailMedia({
  mediaUrl,
  thumbnailUrl,
  galleryImages,
  decodedTitle,
  isVideoMedia,
  imageExpanded,
  onToggleExpanded,
}: PostDetailMediaProps) {
  const { t } = useTranslation();
  const [galleryIndex, setGalleryIndex] = useState(0);

  const hasGallery = galleryImages && galleryImages.length > 0;
  const galleryItem = hasGallery ? galleryImages[galleryIndex] : undefined;
  const displayImage = hasGallery ? resolveMediaUrl(galleryItem?.url) : resolveMediaUrl(mediaUrl);
  const externalMedia = !hasGallery ? getExternalVideoMedia(mediaUrl ?? null) : null;
  const embedUrl = externalMedia?.kind === 'iframe' ? externalMedia.src : null;
  const externalVideoUrl = externalMedia?.kind === 'video' ? externalMedia.src : null;
  const resolvedThumbnailUrl = resolveMediaUrl(thumbnailUrl);
  const isEmbeddableVideo = Boolean(embedUrl || externalVideoUrl);
  const embedSizing = getEmbedSizing(embedUrl ?? externalVideoUrl ?? undefined);
  const isGalleryVideo =
    (galleryItem?.media_type ?? '').startsWith('video') ||
    /\.(mp4|webm|mov|m4v|ogg)$/i.test(galleryItem?.url ?? '');
  const isPlayableVideo = isEmbeddableVideo || isVideoMedia || (hasGallery && isGalleryVideo);
  const isHlsVideo = Boolean(
    (displayImage ?? resolvedThumbnailUrl)?.toLowerCase().includes('.m3u8') ||
    (mediaUrl ?? '').toLowerCase().includes('.m3u8')
  );
  const containerClasses = isEmbeddableVideo
    ? embedSizing.className
    : `w-full ${imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px]'}`;

  if (!displayImage && !resolvedThumbnailUrl && !embedUrl && !externalVideoUrl) {
    return null;
  }

  const handlePrevGallery = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGalleryIndex((prev) => (prev > 0 ? prev - 1 : (galleryImages?.length ?? 1) - 1));
  };

  const handleNextGallery = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGalleryIndex((prev) => (prev < (galleryImages?.length ?? 1) - 1 ? prev + 1 : 0));
  };

  return (
    <div className="mb-4 flex flex-col items-start gap-2">
      <div className="relative w-full">
        <div
          className={`overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200 ${
            isPlayableVideo ? '' : 'cursor-pointer'
          }`}
          onClick={isPlayableVideo ? undefined : onToggleExpanded}
          title={
            isPlayableVideo
              ? undefined
              : imageExpanded
                ? t('posts.media.viewer.clickToShrink')
                : t('posts.media.viewer.clickToEnlarge')
          }
        >
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={decodedTitle}
              className={containerClasses}
              style={embedSizing.style}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : externalVideoUrl ? (
            <video
              controls
              className={containerClasses}
              style={embedSizing.style}
              src={externalVideoUrl}
              preload="metadata"
              playsInline
            />
          ) : displayImage ? (
            isVideoMedia || (hasGallery && isGalleryVideo) ? (
              isHlsVideo ? (
                <HlsVideo
                  src={displayImage ?? ''}
                  className={containerClasses}
                  poster={resolvedThumbnailUrl ?? undefined}
                  preload="metadata"
                  controls
                  playsInline
                />
              ) : (
                <video
                  controls
                  className={containerClasses}
                  src={displayImage}
                  preload="metadata"
                  playsInline
                />
              )
            ) : (
              <img
                src={displayImage}
                alt={
                  hasGallery
                    ? `${decodedTitle} (${galleryIndex + 1}/${galleryImages.length})`
                    : decodedTitle
                }
                loading="lazy"
                decoding="async"
                className={`w-full object-contain transition-transform duration-200 ${
                  imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
                }`}
              />
            )
          ) : (
            <img
              src={resolvedThumbnailUrl ?? ''}
              alt={decodedTitle}
              loading="lazy"
              decoding="async"
              className={`w-full object-contain transition-transform duration-200 ${
                imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
              }`}
            />
          )}
        </div>
        {hasGallery && galleryImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevGallery}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label={t('common.accessibility.previousImage')}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleNextGallery}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label={t('common.accessibility.nextImage')}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
              {galleryIndex + 1} / {galleryImages.length}
            </div>
          </>
        )}
      </div>
      {!isPlayableVideo && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          {imageExpanded
            ? t('posts.media.viewer.viewSmaller')
            : t('posts.media.viewer.viewFullSize')}
        </button>
      )}
    </div>
  );
}
