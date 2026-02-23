import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { callsService } from '../services/callsService'
import type { Call, CallManagerState, VideoQuality } from '../types/calls'

interface UseCallManagerReturn {
  callState: CallManagerState
  activeCall: Call | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isCameraOff: boolean
  callDuration: number
  isConnecting: boolean
  callQuality: 'excellent' | 'good' | 'fair' | 'poor' | null
  callError: string | null
  clearCallError: () => void
  // F13: camera device selection
  cameraDevices: MediaDeviceInfo[]
  selectedCameraId: string | null
  videoQuality: VideoQuality
  switchCamera: (deviceId: string) => Promise<void>
  refreshDevices: () => Promise<void>
  setVideoQuality: (q: VideoQuality) => void
  // F14: screen share peer state (local sharing managed in useScreenShare)
  peerIsSharing: boolean
  peerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>
  startCall: (conversationId: number, callType: 'voice' | 'video') => Promise<void>
  answerCall: () => Promise<void>
  rejectCall: () => void
  endCall: () => void
  toggleMute: () => void
  toggleCamera: () => void
}

// Issue 7: Use ideal values so constraints fall back gracefully. Include aspectRatio.
const VIDEO_QUALITY_CONSTRAINTS: Record<VideoQuality, MediaTrackConstraints> = {
  low: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 }, aspectRatio: 4 / 3 },
  medium: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 }, aspectRatio: 4 / 3 },
  high: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, aspectRatio: 16 / 9 },
}

export function useCallManager(): UseCallManagerReturn {
  const { t } = useTranslation()
  const [callState, setCallState] = useState<CallManagerState>('idle')
  const [activeCall, setActiveCall] = useState<Call | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  // Issue 8: track WebRTC 'connecting' state separately from ringing
  const [isConnecting, setIsConnecting] = useState(false)
  // Issue 4: real quality measurement
  const [callQuality, setCallQuality] = useState<'excellent' | 'good' | 'fair' | 'poor' | null>(null)
  // Issue 2: user-visible permission/device errors
  const [callError, setCallError] = useState<string | null>(null)
  // F13: camera devices and quality
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [videoQuality, setVideoQualityState] = useState<VideoQuality>('medium')
  // F14: peer screen share state
  const [peerIsSharing, setPeerIsSharing] = useState(false)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const durationTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const qualityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  // Store incoming call info before user answers
  const incomingSignalRef = useRef<{ sdp: string } | null>(null)

  // Issue 1: Keep a ref to activeCall so the auto-reject timer callback
  // can read the latest value without needing it in the dependency array.
  const activeCallRef = useRef<Call | null>(null)
  useEffect(() => {
    activeCallRef.current = activeCall
  }, [activeCall])

  const clearCallError = useCallback(() => setCallError(null), [])

  // Issue 2: Map DOMException names to human-readable i18n messages.
  const getMediaError = useCallback(
    (err: unknown): string => {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') return t('calls.permissionDenied')
        if (err.name === 'NotFoundError') return t('calls.deviceNotFound')
        if (err.name === 'NotReadableError') return t('calls.deviceInUse')
      }
      return t('calls.startFailed')
    },
    [t],
  )

  // Clean up all media, peer connection, and quality monitoring resources.
  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = undefined
    }
    // Issue 4: stop quality polling
    if (qualityIntervalRef.current) {
      clearInterval(qualityIntervalRef.current)
      qualityIntervalRef.current = null
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    setLocalStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop())
      return null
    })
    setRemoteStream(null)
    pendingCandidatesRef.current = []
    incomingSignalRef.current = null
    setCallDuration(0)
    setIsMuted(false)
    setIsCameraOff(false)
    setPeerIsSharing(false)
    setIsConnecting(false)
    setCallQuality(null)
  }, [])

  // Start call duration timer when call becomes active.
  const startDurationTimer = useCallback(() => {
    setCallDuration(0)
    durationTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1)
    }, 1000)
  }, [])

  // Issue 4: Start polling RTCStatsReport for call quality.
  const startQualityMonitor = useCallback(() => {
    if (qualityIntervalRef.current) return
    qualityIntervalRef.current = setInterval(async () => {
      const pc = peerConnectionRef.current
      if (!pc) return
      const stats = await pc.getStats()
      let totalPacketsLost = 0
      let totalPacketsReceived = 0
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          totalPacketsLost += (report as RTCInboundRtpStreamStats & { packetsLost?: number }).packetsLost ?? 0
          totalPacketsReceived += (report as RTCInboundRtpStreamStats & { packetsReceived?: number }).packetsReceived ?? 0
        }
      })
      const lossRate =
        totalPacketsReceived > 0
          ? totalPacketsLost / (totalPacketsLost + totalPacketsReceived)
          : 0
      if (lossRate < 0.01) setCallQuality('excellent')
      else if (lossRate < 0.05) setCallQuality('good')
      else if (lossRate < 0.15) setCallQuality('fair')
      else setCallQuality('poor')
    }, 5000)
  }, [])

  // Build ICE configuration from API.
  const getIceConfig = useCallback(async (): Promise<RTCConfiguration> => {
    try {
      const { ice_servers } = await callsService.getICEServers()
      return { iceServers: ice_servers }
    } catch {
      return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    }
  }, [])

  // Create a peer connection wired to the active call.
  const createPeerConnection = useCallback(
    async (callId: number): Promise<RTCPeerConnection> => {
      const config = await getIceConfig()
      const pc = new RTCPeerConnection(config)
      peerConnectionRef.current = pc

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          callsService
            .sendSignal(callId, 'candidate', undefined, event.candidate.toJSON())
            .catch((err) => console.error('[useCallManager] Failed to send ICE candidate:', err))
        }
      }

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0] ?? null)
      }

      pc.onconnectionstatechange = () => {
        // Issue 8: expose connecting state for UI feedback
        if (pc.connectionState === 'connecting') {
          setIsConnecting(true)
        }
        if (pc.connectionState === 'connected') {
          setIsConnecting(false)
          startDurationTimer()
          startQualityMonitor()
        }
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'closed'
        ) {
          setIsConnecting(false)
          // Only transition to ended if not already cleaned up.
          setCallState((prev) => (prev === 'active' ? 'ended' : prev))
        }
      }

      return pc
    },
    [getIceConfig, startDurationTimer, startQualityMonitor],
  )

  // F13: enumerate video input devices.
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter((d) => d.kind === 'videoinput')
      setCameraDevices(videoInputs)
    } catch (err) {
      console.error('[useCallManager] refreshDevices error:', err)
    }
  }, [])

  // Issue 9: switchCamera creates a fresh stream instead of mutating the existing one.
  const switchCamera = useCallback(
    async (deviceId: string) => {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, ...VIDEO_QUALITY_CONSTRAINTS[videoQuality] },
          audio: false,
        })
        const newVideoTrack = newStream.getVideoTracks()[0]
        if (!newVideoTrack) {
          newStream.getTracks().forEach((t) => t.stop())
          return
        }

        const pc = peerConnectionRef.current
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) await sender.replaceTrack(newVideoTrack)
        }

        setLocalStream((prev) => {
          if (prev) prev.getVideoTracks().forEach((t) => t.stop())
          const audioTracks = prev?.getAudioTracks() ?? []
          return new MediaStream([newVideoTrack, ...audioTracks])
        })

        setSelectedCameraId(deviceId)
      } catch (err) {
        console.error('[useCallManager] switchCamera error:', err)
      }
    },
    [videoQuality],
  )

  // F13: change video quality mid-call.
  const setVideoQuality = useCallback(
    async (q: VideoQuality) => {
      setVideoQualityState(q)
      const constraints = VIDEO_QUALITY_CONSTRAINTS[q]

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: selectedCameraId
            ? { ...constraints, deviceId: { exact: selectedCameraId } }
            : constraints,
          audio: false,
        })
        const newVideoTrack = newStream.getVideoTracks()[0]
        if (!newVideoTrack) {
          newStream.getTracks().forEach((t) => t.stop())
          return
        }

        const pc = peerConnectionRef.current
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) {
            await sender.replaceTrack(newVideoTrack)
          }
        }

        // Issue 9: build a new stream instead of mutating the existing one
        setLocalStream((prev) => {
          if (prev) prev.getVideoTracks().forEach((t) => t.stop())
          const audioTracks = prev?.getAudioTracks() ?? []
          return new MediaStream([newVideoTrack, ...audioTracks])
        })
      } catch (err) {
        console.error('[useCallManager] setVideoQuality error:', err)
        setCallError(getMediaError(err))
      }
    },
    [selectedCameraId, getMediaError],
  )

  // Listen for device changes (plugged in / removed).
  useEffect(() => {
    refreshDevices()
    const handler = () => refreshDevices()
    navigator.mediaDevices?.addEventListener('devicechange', handler)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handler)
  }, [refreshDevices])

  // startCall: initiate an outgoing call.
  const startCall = useCallback(
    async (conversationId: number, callType: 'voice' | 'video') => {
      if (callState !== 'idle') return

      try {
        const qualityConstraints = VIDEO_QUALITY_CONSTRAINTS[videoQuality]
        const constraints: MediaStreamConstraints =
          callType === 'video'
            ? { audio: true, video: qualityConstraints }
            : { audio: true }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        setLocalStream(stream)

        // Capture first camera device id.
        if (callType === 'video') {
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack) {
            setSelectedCameraId(videoTrack.getSettings().deviceId ?? null)
          }
          await refreshDevices()
        }

        const call = await callsService.startCall(conversationId, callType)
        setActiveCall(call)
        setCallState('ringing_outgoing')

        const pc = await createPeerConnection(call.id)
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await callsService.sendSignal(call.id, 'offer', offer.sdp)
      } catch (err) {
        console.error('[useCallManager] startCall error:', err)
        // Issue 2: show error to user
        setCallError(getMediaError(err))
        cleanup()
        setCallState('idle')
        setActiveCall(null)
      }
    },
    [callState, createPeerConnection, cleanup, videoQuality, refreshDevices, getMediaError],
  )

  // answerCall: accept an incoming call.
  const answerCall = useCallback(async () => {
    if (callState !== 'ringing_incoming' || !activeCall) return

    try {
      const callType = activeCall.call_type
      const qualityConstraints = VIDEO_QUALITY_CONSTRAINTS[videoQuality]
      const constraints: MediaStreamConstraints =
        callType === 'video'
          ? { audio: true, video: qualityConstraints }
          : { audio: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setLocalStream(stream)

      if (callType === 'video') {
        const videoTrack = stream.getVideoTracks()[0]
        if (videoTrack) {
          setSelectedCameraId(videoTrack.getSettings().deviceId ?? null)
        }
        await refreshDevices()
      }

      await callsService.answerCall(activeCall.id)
      setActiveCall((prev) => (prev ? { ...prev, status: 'active' } : prev))
      setCallState('active')
      startDurationTimer()

      const pc = await createPeerConnection(activeCall.id)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      // Apply the stored offer SDP.
      if (incomingSignalRef.current) {
        await pc.setRemoteDescription({
          type: 'offer',
          sdp: incomingSignalRef.current.sdp,
        })

        // Flush queued candidates.
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate).catch((e) =>
            console.error('[useCallManager] Failed to add queued candidate:', e),
          )
        }
        pendingCandidatesRef.current = []

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await callsService.sendSignal(activeCall.id, 'answer', answer.sdp)
      }
    } catch (err) {
      console.error('[useCallManager] answerCall error:', err)
      // Issue 2: show error to user
      setCallError(getMediaError(err))
      cleanup()
      setCallState('idle')
      setActiveCall(null)
    }
  }, [callState, activeCall, createPeerConnection, startDurationTimer, cleanup, videoQuality, refreshDevices, getMediaError])

  // rejectCall: decline an incoming call.
  const rejectCall = useCallback(() => {
    if (!activeCall) return
    callsService.rejectCall(activeCall.id).catch((err) =>
      console.error('[useCallManager] rejectCall error:', err),
    )
    cleanup()
    setCallState('idle')
    setActiveCall(null)
  }, [activeCall, cleanup])

  // endCall: hang up an active or outgoing call.
  const endCall = useCallback(() => {
    if (!activeCall) return
    callsService.endCall(activeCall.id).catch((err) =>
      console.error('[useCallManager] endCall error:', err),
    )
    cleanup()
    setCallState('idle')
    setActiveCall(null)
  }, [activeCall, cleanup])

  const toggleMute = useCallback(() => {
    setLocalStream((stream) => {
      if (stream) {
        stream.getAudioTracks().forEach((t) => {
          t.enabled = isMuted // toggling: if was muted, now unmute
        })
      }
      return stream
    })
    setIsMuted((prev) => !prev)
  }, [isMuted])

  const toggleCamera = useCallback(() => {
    setLocalStream((stream) => {
      if (stream) {
        stream.getVideoTracks().forEach((t) => {
          t.enabled = isCameraOff // if was off, turn on
        })
      }
      return stream
    })
    setIsCameraOff((prev) => !prev)
  }, [isCameraOff])

  // Handle WebSocket call events via the custom DOM event dispatched from WebSocketContext.
  useEffect(() => {
    const handler = async (event: Event) => {
      const { type, payload } = (event as CustomEvent<{ type: string; payload: unknown }>).detail
      const p = payload as Record<string, unknown>

      switch (type) {
        case 'call_incoming': {
          if (callState !== 'idle') {
            // Already in a call — auto-reject.
            if (typeof p.call_id === 'number') {
              callsService.rejectCall(p.call_id).catch(() => {})
            }
            return
          }
          // Build a partial Call object from the event payload.
          const incomingCall: Call = {
            id: p.call_id as number,
            conversation_id: p.conversation_id as number,
            caller_id: p.caller_id as number,
            callee_id: 0, // will be filled when user looks at activeCall
            call_type: (p.call_type as 'voice' | 'video') ?? 'voice',
            status: 'ringing',
            started_at: new Date().toISOString(),
            caller_username: p.caller_username as string | undefined,
          }
          setActiveCall(incomingCall)
          setCallState('ringing_incoming')
          break
        }

        case 'call_answered': {
          setCallState('active')
          setActiveCall((prev) => (prev ? { ...prev, status: 'active' } : prev))
          startDurationTimer()
          break
        }

        case 'call_rejected': {
          cleanup()
          setCallState('idle')
          setActiveCall(null)
          break
        }

        case 'call_ended': {
          cleanup()
          setCallState('idle')
          setActiveCall(null)
          break
        }

        case 'call_signal': {
          const signal = payload as { call_id: number; signal_type: string; sdp?: string; candidate?: RTCIceCandidateInit }
          const pc = peerConnectionRef.current

          if (signal.signal_type === 'offer' && signal.sdp) {
            // Store for when user answers.
            incomingSignalRef.current = { sdp: signal.sdp }
          } else if (signal.signal_type === 'answer' && signal.sdp && pc) {
            await pc
              .setRemoteDescription({ type: 'answer', sdp: signal.sdp })
              .catch((e) => console.error('[useCallManager] setRemoteDescription error:', e))
            // Flush any queued candidates.
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(candidate).catch((e) =>
                console.error('[useCallManager] Failed to add queued candidate:', e),
              )
            }
            pendingCandidatesRef.current = []
          } else if (signal.signal_type === 'candidate' && signal.candidate) {
            if (pc && pc.remoteDescription) {
              await pc
                .addIceCandidate(signal.candidate)
                .catch((e) => console.error('[useCallManager] addIceCandidate error:', e))
            } else {
              pendingCandidatesRef.current.push(signal.candidate)
            }
          }
          break
        }

        case 'screen_share_started': {
          setPeerIsSharing(true)
          break
        }

        case 'screen_share_stopped': {
          setPeerIsSharing(false)
          break
        }

        default:
          break
      }
    }

    window.addEventListener('ws-call-event', handler)
    return () => window.removeEventListener('ws-call-event', handler)
  }, [callState, cleanup, startDurationTimer])

  // Issue 1: Auto-dismiss incoming call after 30s (missed call).
  // Uses activeCallRef so the callback reads the latest value without
  // needing activeCall or cleanup in the dependency array, preventing
  // the stale-closure race condition that was constantly resetting the timer.
  useEffect(() => {
    if (callState !== 'ringing_incoming') return
    const timer = setTimeout(() => {
      const call = activeCallRef.current
      if (call) {
        callsService.rejectCall(call.id).catch(() => {})
      }
      cleanup()
      setCallState('idle')
      setActiveCall(null)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [callState, cleanup])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    callState,
    activeCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    callDuration,
    isConnecting,
    callQuality,
    callError,
    clearCallError,
    cameraDevices,
    selectedCameraId,
    videoQuality,
    switchCamera,
    refreshDevices,
    setVideoQuality,
    peerIsSharing,
    peerConnectionRef,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  }
}
