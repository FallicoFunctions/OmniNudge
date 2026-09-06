import { useEffect, useState } from 'react';
import { ImageIcon, Play, RefreshCw, Video } from 'lucide-react';
import { mediaAssetContentUrl, mediaAssetThumbnailUrl } from '../../services/omnichatService';
import type {
  OmniChatMediaAsset,
  OmniChatMessageMediaAsset,
  OmniChatPublicMediaAsset,
} from '../../types/omnichat';

type AnyMediaAsset = OmniChatMediaAsset | OmniChatMessageMediaAsset | OmniChatPublicMediaAsset;

/**
 * Media goes straight into a src.
 *
 * This used to read every asset into a blob with an authenticated fetch, on the
 * belief that the route needed an auth header. It does not: media here is
 * authorized by cookie, and a GET carries no headers of its own, so an element
 * fetches it exactly as well as a script can.
 *
 * A blob is a whole download. Reading the bytes ourselves threw away everything
 * the browser does better -- byte ranges, so a clip plays before it has
 * arrived; seeking; its own cache; and native lazy loading -- and one real clip
 * is 6.6 MB before a first frame could appear.
 *
 * What is lost: a 401 on an element cannot run the refresh-and-retry that the
 * fetch wrapper does. The page's own API calls meet that first and refresh, and
 * the retry below is the manual way back.
 */
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
  const [failed, setFailed] = useState(false);

  const thumbnailPath = 'thumbnail_url' in asset ? asset.thumbnail_url : undefined;
  const isVideo = asset.kind === 'video';
  const showsThumbnailOnly = preview && !opened;
  const alt = 'prompt' in asset && asset.prompt ? asset.prompt : `Generated character ${asset.kind}`;

  useEffect(() => {
    setOpened(false);
    setFailed(false);
  }, [asset.id]);

  // A URL the API did not mint, or one pointing at another origin, is refused
  // rather than assigned: the resolvers throw on both.
  let contentSrc: string | null = null;
  let thumbnailSrc: string | null = null;
  try {
    contentSrc = mediaAssetContentUrl(asset.id, asset.content_url);
    thumbnailSrc = thumbnailPath ? mediaAssetThumbnailUrl(asset.id, thumbnailPath) : null;
  } catch {
    contentSrc = null;
    thumbnailSrc = null;
  }
  // Retrying has to ask for something the browser has not already failed on,
  // or the cache answers with the same failure and the button does nothing.
  const retry = attempt > 0 ? `${contentSrc?.includes('?') ? '&' : '?'}retry=${attempt}` : '';

  const badge = (
    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 p-2 text-white/80 backdrop-blur">
      {isVideo ? <Video size={14} /> : <ImageIcon size={14} />}
    </span>
  );

  if (failed || !contentSrc) {
    return (
      <button
        type="button"
        onClick={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
        className={`flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-black/25 text-sm text-white/60 ${className}`}
      >
        <RefreshCw size={20} />
        Retry generated media
      </button>
    );
  }

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
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc + retry}
            alt={alt}
            // The browser defers a tile below the fold on its own. An
            // IntersectionObserver here would be a second, worse copy of what
            // it already does for an img with a src.
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
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
          <span className="text-white/25">
            {isVideo ? <Video size={32} /> : <ImageIcon size={32} />}
          </span>
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

  if (isVideo) {
    return (
      <div
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-black ${className}`}
      >
        <video
          src={contentSrc + retry}
          // The thumbnail shows while the clip is still arriving, so an opened
          // tile does not go black between the tile and the first frame.
          poster={thumbnailSrc ?? undefined}
          controls
          autoPlay={opened}
          playsInline
          // Now that the route answers byte ranges this means what it says:
          // enough to know the length, and the rest when somebody plays.
          preload="metadata"
          onError={() => setFailed(true)}
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
        src={contentSrc + retry}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="block max-h-[75vh] max-w-full object-contain"
      />
      {badge}
    </div>
  );
}
