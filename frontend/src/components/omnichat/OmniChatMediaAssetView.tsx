import { useEffect, useState } from 'react';
import { ImageIcon, Loader2, Play, RefreshCw, Video } from 'lucide-react';
import { omnichatService } from '../../services/omnichatService';
import type {
  OmniChatMediaAsset,
  OmniChatMessageMediaAsset,
  OmniChatPublicMediaAsset,
} from '../../types/omnichat';

type AnyMediaAsset = OmniChatMediaAsset | OmniChatMessageMediaAsset | OmniChatPublicMediaAsset;

/**
 * Fetches an asset's bytes through the API and hands back an object URL, or
 * null while it has none.
 *
 * Public asset authorization still depends on the viewer's NSFW preference and
 * block graph, so the bytes are fetched with the API auth header instead of
 * assigning the route directly to an img or video src.
 *
 * A null source fetches nothing. That is what keeps a gallery tile from pulling
 * the asset it is not showing.
 */
function useAuthorizedMediaUrl(
  source: 'content' | 'thumbnail' | null,
  assetId: string,
  contentUrl: string,
  thumbnailUrl: string | undefined,
  visibility: string,
  attempt: number,
) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!source) {
      setObjectUrl(null);
      setFailed(false);
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    const request =
      source === 'thumbnail'
        ? omnichatService.getMediaAssetThumbnail(assetId, thumbnailUrl)
        : omnichatService.getMediaAssetContent(assetId, contentUrl);
    void request
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [source, assetId, contentUrl, thumbnailUrl, visibility, attempt]);

  return { objectUrl, failed };
}

export default function OmniChatMediaAssetView({
  asset,
  className = '',
  preview = false,
}: {
  asset: AnyMediaAsset;
  className?: string;
  /**
   * A tile in a grid rather than the media itself.
   *
   * A tile shows the asset's thumbnail and loads nothing else until the viewer
   * asks for it. Before this, a page of twenty-four tiles downloaded every
   * asset in full -- about a megabyte for a generated image and 6.6 MB for one
   * real clip -- on every visit, whether or not anybody looked closer.
   */
  preview?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState(false);

  const thumbnailURL = 'thumbnail_url' in asset ? asset.thumbnail_url : undefined;
  const isVideo = asset.kind === 'video';
  const showsThumbnailOnly = preview && !opened;

  useEffect(() => {
    setOpened(false);
  }, [asset.id]);

  const { objectUrl: mediaUrl, failed: mediaFailed } = useAuthorizedMediaUrl(
    showsThumbnailOnly ? null : 'content',
    asset.id,
    asset.content_url,
    thumbnailURL,
    asset.visibility,
    attempt,
  );
  const { objectUrl: thumbnailUrl } = useAuthorizedMediaUrl(
    showsThumbnailOnly && thumbnailURL ? 'thumbnail' : null,
    asset.id,
    asset.content_url,
    thumbnailURL,
    asset.visibility,
    attempt,
  );

  const badge = (
    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 p-2 text-white/80 backdrop-blur">
      {isVideo ? <Video size={14} /> : <ImageIcon size={14} />}
    </span>
  );

  // A tile in a grid. Nothing of the asset is fetched: the thumbnail stands in
  // for it, and a viewer who wants the real thing says so.
  if (showsThumbnailOnly) {
    return (
      <button
        type="button"
        aria-label={isVideo ? 'Play generated video' : 'Open generated image'}
        onClick={() => setOpened(true)}
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-black ${className}`}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={
              'prompt' in asset && asset.prompt
                ? asset.prompt
                : `Generated character ${asset.kind}`
            }
            // Contained rather than cropped, which is how the full asset
            // renders in the same grid. A portrait frame cropped to fill a 4:5
            // tile loses about a seventh of its height at each end, and on a
            // full-body picture that takes the head off.
            className="block h-full w-full object-contain"
          />
        ) : (
          // No thumbnail: everything generated before thumbnails existed, and
          // anything whose thumbnail could not be made. Showing the asset
          // instead would put the whole download back for exactly those.
          <span className="text-white/25">{isVideo ? <Video size={32} /> : <ImageIcon size={32} />}</span>
        )}
        {isVideo && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/55 p-3 text-white/90 backdrop-blur">
              <Play size={20} />
            </span>
          </span>
        )}
        {badge}
      </button>
    );
  }

  if (mediaFailed) {
    return (
      <button
        type="button"
        onClick={() => setAttempt((value) => value + 1)}
        className={`flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-black/25 text-sm text-white/60 ${className}`}
      >
        <RefreshCw size={20} />
        Retry generated media
      </button>
    );
  }

  if (!mediaUrl) {
    return (
      <div
        aria-label={`Loading generated ${asset.kind}`}
        className={`flex min-h-40 w-full items-center justify-center rounded-2xl bg-black/25 text-white/50 ${className}`}
      >
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-black ${className}`}
      >
        <video
          src={mediaUrl}
          controls
          autoPlay={opened}
          playsInline
          preload="metadata"
          className="block max-h-[75vh] max-w-full object-contain"
        />
        {badge}
      </div>
    );
  }

  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-black/25 ${className}`}
    >
      <img
        src={mediaUrl}
        alt={'prompt' in asset && asset.prompt ? asset.prompt : 'Generated character scene'}
        className="block max-h-[75vh] max-w-full object-contain"
      />
      {badge}
    </div>
  );
}
