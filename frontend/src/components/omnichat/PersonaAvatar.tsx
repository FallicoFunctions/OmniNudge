import { useEffect, useRef } from 'react';
import { getPersonaGradient } from '../../utils/personaGradients';
import type { BotPersona } from '../../types/omnichat';
import { resolveMediaUrl } from '../../utils/mediaUrl';

export default function PersonaAvatar({
  persona,
  className = 'aspect-square w-full',
  previewEnabled = false,
  previewActive = false,
  previewVisibleWhenInactive = false,
  resetOnInactive = true,
  loopPreview = true,
  previewVersion = 0,
  hideOverlay = false,
  onPreviewEnded,
}: {
  persona: BotPersona;
  className?: string;
  previewEnabled?: boolean;
  previewActive?: boolean;
  previewVisibleWhenInactive?: boolean;
  resetOnInactive?: boolean;
  loopPreview?: boolean;
  previewVersion?: number;
  hideOverlay?: boolean;
  onPreviewEnded?: () => void;
}) {
  const gradient = getPersonaGradient(persona);
  const avatarSrc = resolveMediaUrl(persona.avatar_url, persona.updated_at);
  const previewVideoSrc = resolveMediaUrl(persona.preview_video_url, persona.updated_at);
  const shouldRenderPreview = previewEnabled && Boolean(previewVideoSrc);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const rewindToStart = (video: HTMLVideoElement) => {
    try {
      video.currentTime = 0;
    } catch {
      return;
    }
  };

  const attemptPlay = (video: HTMLVideoElement) => {
    try {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => undefined);
      }
    } catch {
      return;
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldRenderPreview) {
      return;
    }

    video.defaultMuted = true;

    if (previewActive) {
      rewindToStart(video);
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        const handleLoadedData = () => {
          attemptPlay(video);
        };
        video.addEventListener('loadeddata', handleLoadedData, { once: true });
        video.load();
        return () => {
          video.removeEventListener('loadeddata', handleLoadedData);
        };
      }

      attemptPlay(video);
      return;
    }

    video.pause();
    if (resetOnInactive) {
      rewindToStart(video);
    }
  }, [previewActive, previewVersion, resetOnInactive, shouldRenderPreview]);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={`${persona.name} avatar`}
          data-testid="persona-poster-image"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: gradient }}
        />
      )}
      {shouldRenderPreview && (
        <video
          key={`${previewVideoSrc}-${previewVersion}`}
          ref={videoRef}
          data-testid="persona-preview-video"
          src={previewVideoSrc}
          poster={avatarSrc}
          muted
          playsInline
          preload="metadata"
          loop={loopPreview}
          onEnded={onPreviewEnded}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            previewActive || previewVisibleWhenInactive ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      {!hideOverlay && <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />}
    </div>
  );
}
