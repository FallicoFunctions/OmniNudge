import React, { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, X, Check, Trash2, Play, Pause } from 'lucide-react'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import { RecordingAnimation } from './RecordingAnimation'
import { WaveformVisualizer } from './WaveformVisualizer'

interface VoiceRecorderButtonProps {
  onVoiceMessage: (blob: Blob, durationSeconds: number) => void
  disabled?: boolean
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function VoiceRecorderButton({ onVoiceMessage, disabled = false }: VoiceRecorderButtonProps) {
  const { t } = useTranslation()
  const { state, durationSeconds, audioBlob, audioLevel, error, start, stop, cancel } = useVoiceRecorder()
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [previewProgress, setPreviewProgress] = React.useState(0)
  const previewUrl = React.useMemo(
    () => (audioBlob ? URL.createObjectURL(audioBlob) : null),
    [audioBlob]
  )

  React.useEffect(() => {
    // Destroy old Audio element when previewUrl changes (re-record) or on unmount
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current.src = ''
        previewAudioRef.current.ontimeupdate = null
        previewAudioRef.current.onended = null
        previewAudioRef.current = null
      }
      setIsPlaying(false)
      setPreviewProgress(0)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleSend = useCallback(() => {
    if (audioBlob) {
      onVoiceMessage(audioBlob, durationSeconds)
      cancel()
    }
  }, [audioBlob, durationSeconds, onVoiceMessage, cancel])

  const togglePreviewPlay = useCallback(() => {
    if (!previewUrl) return
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(previewUrl)
      previewAudioRef.current.ontimeupdate = () => {
        const audio = previewAudioRef.current
        if (audio && audio.duration) {
          setPreviewProgress(audio.currentTime / audio.duration)
        }
      }
      previewAudioRef.current.onended = () => {
        setIsPlaying(false)
        setPreviewProgress(0)
      }
    }
    if (isPlaying) {
      previewAudioRef.current.pause()
      setIsPlaying(false)
    } else {
      previewAudioRef.current.play()
      setIsPlaying(true)
    }
  }, [previewUrl, isPlaying])

  // Idle: show microphone button
  if (state === 'idle' || state === 'requesting' || state === 'error') {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled || state === 'requesting'}
        title={error ?? t('voice.record')}
        aria-label={error ?? t('voice.record')}
        className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
        style={{ color: error ? 'var(--color-error)' : 'var(--color-text-muted)' }}
      >
        <Mic size={18} />
      </button>
    )
  }

  // Recording state
  if (state === 'recording' || state === 'paused') {
    return (
      <div
        className="flex items-center gap-2 w-full px-2 py-1 rounded-xl"
        style={{ background: 'color-mix(in srgb, var(--color-error) 8%, var(--color-surface))' }}
      >
        {/* Cancel */}
        <button
          type="button"
          onClick={cancel}
          title={t('voice.cancel')}
          aria-label={t('voice.cancel')}
          className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <X size={16} />
        </button>

        {/* Recording animation + timer */}
        <RecordingAnimation audioLevel={audioLevel} />
        <span
          className="text-sm font-medium tabular-nums flex-shrink-0 w-10"
          style={{ color: 'var(--color-error)' }}
        >
          {formatDuration(durationSeconds)}
        </span>

        {/* Live waveform */}
        <div className="flex-1 min-w-0">
          <WaveformVisualizer
            data={[]}
            progress={0}
            isLive
            liveLevel={audioLevel}
          />
        </div>

        {/* Send */}
        <button
          type="button"
          onClick={() => stop()}
          title={t('voice.send')}
          aria-label={t('voice.send')}
          className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          <Check size={16} />
        </button>
      </div>
    )
  }

  // Stopped — preview
  if (state === 'stopped' && audioBlob) {
    return (
      <div
        className="flex items-center gap-2 w-full px-2 py-1 rounded-xl"
        style={{ background: 'var(--color-surface-alt)' }}
      >
        {/* Re-record */}
        <button
          type="button"
          onClick={cancel}
          title={t('voice.reRecord')}
          aria-label={t('voice.reRecord')}
          className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Trash2 size={16} />
        </button>

        {/* Play/pause preview */}
        <button
          type="button"
          onClick={togglePreviewPlay}
          title={isPlaying ? t('voice.pause') : t('voice.play')}
          aria-label={isPlaying ? t('voice.pause') : t('voice.play')}
          className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
          style={{ color: 'var(--color-primary)' }}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        {/* Waveform */}
        <div className="flex-1 min-w-0">
          <WaveformVisualizer data={[]} progress={previewProgress} />
        </div>

        {/* Duration */}
        <span
          className="text-xs tabular-nums flex-shrink-0"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {formatDuration(durationSeconds)}
        </span>

        {/* Send */}
        <button
          type="button"
          onClick={handleSend}
          title={t('voice.send')}
          aria-label={t('voice.send')}
          className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          <Check size={16} />
        </button>
      </div>
    )
  }

  return null
}
