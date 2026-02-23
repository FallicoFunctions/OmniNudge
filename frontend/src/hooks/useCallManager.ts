import { useState, useRef, useCallback, useEffect } from 'react'
import { callsService } from '../services/callsService'
import type { Call, CallManagerState, CallSignal, VideoQuality } from '../types/calls'

interface UseCallManagerReturn {
  callState: CallManagerState
  activeCall: Call | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isCameraOff: boolean
  callDuration: number
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

const VIDEO_QUALITY_CONSTRAINTS: Record<VideoQuality, MediaTrackConstraints> = {
  low: { width: 320, height: 240, frameRate: 15 },
  medium: { width: 640, height: 480, frameRate: 24 },
  high: { width: 1280, height: 720, frameRate: 30 },
}

export function useCallManager(): UseCallManagerReturn {
  const [callState, setCallState] = useState<CallManagerState>('idle')
  const [activeCall, setActiveCall] = useState<Call | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  // F13: camera devices and quality
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [videoQuality, setVideoQualityState] = useState<VideoQuality>('medium')
  // F14: peer screen share state
  const [peerIsSharing, setPeerIsSharing] = useState(false)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const durationTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  // Store incoming call info before user answers
  const incomingSignalRef = useRef<{ sdp: string } | null>(null)

  // Clean up all media and peer connection resources.
  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = undefined
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
  }, [])

  // Start call duration timer when call becomes active.
  const startDurationTimer = useCallback(() => {
    setCallDuration(0)
    durationTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1)
    }, 1000)
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
        if (pc.connectionState === 'connected') {
          startDurationTimer()
        }
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'closed'
        ) {
          // Only transition to ended if not already cleaned up.
          setCallState((prev) => (prev === 'active' ? 'ended' : prev))
        }
      }

      return pc
    },
    [getIceConfig, startDurationTimer],
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

  // F13: switch to a different camera device.
  const switchCamera = useCallback(
    async (deviceId: string) => {
      try {
        const constraints = VIDEO_QUALITY_CONSTRAINTS[videoQuality]
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { ...constraints, deviceId: { exact: deviceId } },
          audio: false,
        })
        const newVideoTrack = newStream.getVideoTracks()[0]
        if (!newVideoTrack) return

        const pc = peerConnectionRef.current
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) {
            await sender.replaceTrack(newVideoTrack)
          }
        }

        setLocalStream((prev) => {
          if (prev) {
            // Stop old video track(s) but keep audio.
            prev.getVideoTracks().forEach((t) => t.stop())
            prev.getVideoTracks().forEach((t) => prev.removeTrack(t))
            prev.addTrack(newVideoTrack)
            return prev
          }
          return newStream
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
        if (!newVideoTrack) return

        const pc = peerConnectionRef.current
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) {
            await sender.replaceTrack(newVideoTrack)
          }
        }

        setLocalStream((prev) => {
          if (prev) {
            prev.getVideoTracks().forEach((t) => t.stop())
            prev.getVideoTracks().forEach((t) => prev.removeTrack(t))
            prev.addTrack(newVideoTrack)
            return prev
          }
          return newStream
        })
      } catch (err) {
        console.error('[useCallManager] setVideoQuality error:', err)
      }
    },
    [selectedCameraId],
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
        cleanup()
        setCallState('idle')
        setActiveCall(null)
      }
    },
    [callState, createPeerConnection, cleanup, videoQuality, refreshDevices],
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
      cleanup()
      setCallState('idle')
      setActiveCall(null)
    }
  }, [callState, activeCall, createPeerConnection, startDurationTimer, cleanup, videoQuality, refreshDevices])

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

  // Auto-dismiss incoming call after 30s (missed call).
  useEffect(() => {
    if (callState !== 'ringing_incoming') return
    const timer = setTimeout(() => {
      if (activeCall) {
        callsService.rejectCall(activeCall.id).catch(() => {})
      }
      cleanup()
      setCallState('idle')
      setActiveCall(null)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [callState, activeCall, cleanup])

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
