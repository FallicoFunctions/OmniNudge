import { useState, useRef, useEffect, useCallback } from 'react'
import i18n from 'i18next'

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'error'

export interface UseVoiceRecorderReturn {
  state: RecordingState
  durationSeconds: number
  audioBlob: Blob | null
  audioLevel: number
  error: string | null
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
  cancel: () => void
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  '',
]

function getSupportedMimeType(): string {
  for (const type of PREFERRED_MIME_TYPES) {
    if (type === '' || MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [state, setState] = useState<RecordingState>('idle')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    if (levelIntervalRef.current) clearInterval(levelIntervalRef.current)
    durationIntervalRef.current = null
    levelIntervalRef.current = null

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    mediaRecorderRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch {}
      audioCtxRef.current = null
    }
    analyserRef.current = null
  }, [])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const start = useCallback(async () => {
    setState('requesting')
    setError(null)
    setDurationSeconds(0)
    setAudioBlob(null)
    chunksRef.current = []

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError(i18n.t('voice.permissionDenied'))
        } else if (err.name === 'NotFoundError') {
          setError(i18n.t('voice.noMicrophone'))
        } else {
          setError(i18n.t('voice.recordingError'))
        }
      } else {
        setError(i18n.t('voice.recordingError'))
      }
      setState('error')
      return
    }

    streamRef.current = stream

    // Set up audio analyser for live level.
    const audioCtx = new AudioContext()
    audioCtxRef.current = audioCtx
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser

    const freqData = new Uint8Array(analyser.frequencyBinCount)
    levelIntervalRef.current = setInterval(() => {
      if (!analyserRef.current) return
      analyserRef.current.getByteFrequencyData(freqData)
      let max = 0
      for (let i = 0; i < freqData.length; i++) { if (freqData[i] > max) max = freqData[i] }
      setAudioLevel(max / 255)
    }, 50)

    // Set up MediaRecorder.
    const mimeType = getSupportedMimeType()
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
    const recorder = new MediaRecorder(stream, options)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      setAudioBlob(blob)
      setAudioLevel(0)
      if (levelIntervalRef.current) clearInterval(levelIntervalRef.current)
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    }

    recorder.start(250)
    setState('recording')

    durationIntervalRef.current = setInterval(() => {
      setDurationSeconds(prev => prev + 1)
    }, 1000)
  }, [])

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      setState('paused')
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
      if (levelIntervalRef.current) clearInterval(levelIntervalRef.current)
      setAudioLevel(0)
    }
  }, [])

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      setState('recording')

      durationIntervalRef.current = setInterval(() => {
        setDurationSeconds(prev => prev + 1)
      }, 1000)

      const resumeFreqData = new Uint8Array(analyserRef.current!.frequencyBinCount)
      levelIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(resumeFreqData)
        let max = 0
        for (let i = 0; i < resumeFreqData.length; i++) { if (resumeFreqData[i] > max) max = resumeFreqData[i] }
        setAudioLevel(max / 255)
      }, 50)
    }
  }, [])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    if (levelIntervalRef.current) clearInterval(levelIntervalRef.current)
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch {}
      audioCtxRef.current = null
    }
    setState('stopped')
  }, [])

  const cancel = useCallback(() => {
    cleanup()
    setState('idle')
    setDurationSeconds(0)
    setAudioBlob(null)
    setAudioLevel(0)
    setError(null)
    chunksRef.current = []
  }, [cleanup])

  return { state, durationSeconds, audioBlob, audioLevel, error, start, pause, resume, stop, cancel }
}
