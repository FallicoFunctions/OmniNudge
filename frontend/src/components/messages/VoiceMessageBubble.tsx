import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, ChevronDown, ChevronUp } from 'lucide-react';
import type { VoiceMessage } from '../../types/messages';
import { useVoicePlayer } from '../../hooks/useVoicePlayer';
import { WaveformVisualizer } from './WaveformVisualizer';

interface VoiceMessageBubbleProps {
  voiceMessage: VoiceMessage;
  isOwn: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PLAYBACK_RATES = [1, 1.5, 2];

export function VoiceMessageBubble({ voiceMessage, isOwn }: VoiceMessageBubbleProps) {
  const { t } = useTranslation();
  const {
    state,
    currentTime,
    duration,
    progress,
    playbackRate,
    play,
    pause,
    seek,
    setPlaybackRate,
  } = useVoicePlayer();
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);

  const isPlaying = state === 'playing';
  const isLoading = state === 'loading';

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play(voiceMessage.signed_url);
    }
  }, [isPlaying, pause, play, voiceMessage.signed_url]);

  const totalDuration = duration > 0 ? duration : voiceMessage.duration_seconds;

  return (
    <div
      className="flex flex-col gap-1 rounded-2xl px-3 py-2"
      style={{
        minWidth: '240px',
        maxWidth: '320px',
        background: isOwn ? 'var(--color-primary)' : 'var(--color-surface-alt)',
        color: isOwn ? '#fff' : 'var(--color-text-primary)',
      }}
    >
      {/* Main row: play button + waveform + time */}
      <div className="flex items-center gap-2">
        {/* Play/Pause button */}
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={isLoading}
          aria-label={isPlaying ? t('voice.pause') : t('voice.play')}
          className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 transition-opacity"
          style={{
            background: isOwn ? 'rgba(255,255,255,0.2)' : 'var(--color-primary)',
            color: isOwn ? '#fff' : '#fff',
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        {/* Waveform */}
        <div className="flex-1 min-w-0">
          <WaveformVisualizer
            data={voiceMessage.waveform_data ?? []}
            progress={progress}
            onSeek={seek}
          />
        </div>

        {/* Time */}
        <span
          className="text-xs tabular-nums flex-shrink-0"
          style={{
            opacity: isOwn ? 0.85 : undefined,
            color: isOwn ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>

      {/* Playback speed row */}
      <div className="flex items-center gap-1">
        {PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => setPlaybackRate(rate)}
            aria-label={`${t('voice.speed')} ${rate}x`}
            className="text-xs px-1.5 py-0.5 rounded transition-opacity"
            style={{
              background:
                playbackRate === rate
                  ? isOwn
                    ? 'rgba(255,255,255,0.25)'
                    : 'var(--color-primary)'
                  : 'transparent',
              color:
                playbackRate === rate
                  ? isOwn
                    ? '#fff'
                    : '#fff'
                  : isOwn
                    ? 'rgba(255,255,255,0.7)'
                    : 'var(--color-text-secondary)',
              fontWeight: playbackRate === rate ? 600 : 400,
            }}
          >
            {rate}×
          </button>
        ))}
      </div>

      {/* Transcription */}
      {voiceMessage.transcription && (
        <div>
          <button
            type="button"
            onClick={() => setTranscriptionOpen((o) => !o)}
            className="flex items-center gap-1 text-xs"
            style={{ opacity: 0.75 }}
          >
            {transcriptionOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {transcriptionOpen ? t('voice.hideTranscription') : t('voice.showTranscription')}
          </button>
          {transcriptionOpen && (
            <p className="text-xs mt-1" style={{ opacity: 0.9 }}>
              {voiceMessage.transcription}
            </p>
          )}
        </div>
      )}

      {/* Processing state */}
      {!voiceMessage.waveform_data && !voiceMessage.transcription && state === 'idle' && (
        <p className="text-xs" style={{ opacity: 0.6 }}>
          {t('voice.processing')}
        </p>
      )}
    </div>
  );
}
