import { useState, useRef, useCallback } from 'react'

// Global singleton — only one voice message plays at a time.
const globalAudioRef: { current: HTMLAudioElement | null; stopCallback: (() => void) | null } = {
  current: null,
  stopCallback: null,
}

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export interface UseVoicePlayerReturn {
  state: PlaybackState
  currentTime: number
  duration: number
  progress: number
  playbackRate: number
  error: string | null
  play: (url: string) => void
  pause: () => void
  seek: (progress: number) => void
  setPlaybackRate: (rate: number) => void
}

export function useVoicePlayer(): UseVoicePlayerReturn {
  const [state, setState] = useState<PlaybackState>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastUpdateRef = useRef(0)

  const stopCurrent = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
    setState('idle')
    setCurrentTime(0)
    setDuration(0)
  }, [])

  const play = useCallback((url: string) => {
    // Stop any currently playing audio globally.
    if (globalAudioRef.stopCallback) {
      globalAudioRef.stopCallback()
    }

    const audio = new Audio(url)
    audioRef.current = audio
    globalAudioRef.current = audio
    globalAudioRef.stopCallback = stopCurrent

    setState('loading')
    setError(null)
    setCurrentTime(0)

    audio.playbackRate = playbackRate

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration)
    })

    audio.addEventListener('timeupdate', () => {
      const now = Date.now()
      if (now - lastUpdateRef.current < 250) return
      lastUpdateRef.current = now
      setCurrentTime(audio.currentTime)
    })

    audio.addEventListener('playing', () => {
      setState('playing')
    })

    audio.addEventListener('pause', () => {
      if (!audio.ended) setState('paused')
    })

    audio.addEventListener('ended', () => {
      setState('ended')
      setCurrentTime(audio.duration)
      globalAudioRef.stopCallback = null
    })

    audio.addEventListener('error', () => {
      setError('Could not play voice message.')
      setState('error')
      globalAudioRef.stopCallback = null
    })

    audio.play().catch(() => {
      setError('Could not play voice message.')
      setState('error')
    })
  }, [playbackRate, stopCurrent])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const seek = useCallback((progress: number) => {
    const audio = audioRef.current
    if (audio && audio.duration) {
      audio.currentTime = progress * audio.duration
      setCurrentTime(audio.currentTime)
    }
  }, [])

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }, [])

  const progress = duration > 0 ? currentTime / duration : 0

  return { state, currentTime, duration, progress, playbackRate, error, play, pause, seek, setPlaybackRate }
}
