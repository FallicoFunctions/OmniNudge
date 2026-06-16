import { useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface AudioPlayerProps {
  src: string;
  mimeType?: string | null;
  fileName?: string;
  onLoadedMetadata?: (event: SyntheticEvent<HTMLMediaElement>) => void;
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({
  src,
  mimeType,
  fileName,
  onLoadedMetadata,
}: AudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const progressMax = duration > 0 ? duration : 0;
  const speedLabel = useMemo(
    () => t('messages.media.audio.speedLabel', { speed: playbackRate }),
    [playbackRate, t]
  );

  const handleTogglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }
    audio.pause();
    setIsPlaying(false);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
  };

  const handleLoadedMetadata = (event: SyntheticEvent<HTMLAudioElement>) => {
    setDuration(event.currentTarget.duration || 0);
    onLoadedMetadata?.(event);
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const handlePlaybackRate = (rate: number) => {
    const audio = audioRef.current;
    setPlaybackRate(rate);
    if (audio) {
      audio.playbackRate = rate;
    }
  };

  return (
    <div className="w-full rounded border border-[var(--color-border)] p-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      >
        <source src={src} type={mimeType ?? 'audio/mpeg'} />
        {t('messages.media.preview.audioUnsupported')}
      </audio>

      <div className="mb-2 text-sm font-medium truncate">
        {fileName || t('messages.media.attachmentFallback')}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleTogglePlay}
          className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
          aria-label={isPlaying ? t('messages.media.audio.pause') : t('messages.media.audio.play')}
        >
          {isPlaying ? t('messages.media.audio.pause') : t('messages.media.audio.play')}
        </button>

        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={progressMax}
            step={0.1}
            value={Math.min(currentTime, progressMax)}
            onChange={(event) => handleSeek(Number(event.target.value))}
            className="w-full accent-[var(--color-primary)]"
            aria-label={t('messages.media.audio.seek')}
          />
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </div>
        </div>

        <label className="text-xs text-[var(--color-text-muted)]">
          <span className="sr-only">{t('messages.media.audio.speed')}</span>
          <select
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
            value={playbackRate}
            onChange={(event) => handlePlaybackRate(Number(event.target.value))}
            aria-label={t('messages.media.audio.speed')}
          >
            {PLAYBACK_SPEEDS.map((rate) => (
              <option key={rate} value={rate}>
                {t('messages.media.audio.speedOption', { speed: rate })}
              </option>
            ))}
          </select>
        </label>

        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          download={fileName}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-center"
        >
          {t('common.download')}
        </a>
      </div>

      <div className="mt-2 text-xs text-[var(--color-text-muted)]">{speedLabel}</div>
    </div>
  );
}
