import { useEffect, useState } from 'react';
import { ImageIcon, Loader2, RefreshCw, Video } from 'lucide-react';
import { omnichatService } from '../../services/omnichatService';
import type {
  OmniChatMediaAsset,
  OmniChatMessageMediaAsset,
  OmniChatPublicMediaAsset,
} from '../../types/omnichat';

export default function OmniChatMediaAssetView({
  asset,
  className = '',
}: {
  asset: OmniChatMediaAsset | OmniChatMessageMediaAsset | OmniChatPublicMediaAsset;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setError(false);
    // Public asset authorization still depends on the viewer's NSFW preference
    // and block graph, so fetch with the API auth header instead of assigning
    // the route directly to img/video src.
    const contentRequest = omnichatService.getMediaAssetContent(asset.id, asset.content_url);
    void contentRequest
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [asset.content_url, asset.id, asset.visibility, attempt]);
  const mediaUrl = objectUrl;

  if (error) {
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

  if (asset.kind === 'video') {
    return (
      <div className={`relative overflow-hidden rounded-2xl bg-black ${className}`}>
        <video
          src={mediaUrl}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 p-2 text-white/80 backdrop-blur">
          <Video size={14} />
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-black/25 ${className}`}>
      <img
        src={mediaUrl}
        alt={'prompt' in asset && asset.prompt ? asset.prompt : 'Generated character scene'}
        className="h-full w-full object-cover"
      />
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 p-2 text-white/80 backdrop-blur">
        <ImageIcon size={14} />
      </span>
    </div>
  );
}
