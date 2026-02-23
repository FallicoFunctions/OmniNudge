import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CallControls } from './CallControls'
import { CallQualityIndicator } from './CallQualityIndicator'
import type { Call } from '../../types/calls'

interface CallScreenProps {
  call: Call
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isCameraOff: boolean
  callDuration: number
  isConnecting?: boolean
  onToggleMute: () => void
  onToggleCamera: () => void
  onEndCall: () => void
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function CallScreen({
  call,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  callDuration,
  isConnecting = false,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: CallScreenProps) {
  const { t } = useTranslation()
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  // Attach remote stream to video element.
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Attach local stream to local preview.
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  const isVideo = call.call_type === 'video'
  const remoteName = call.caller_username ?? call.callee_username ?? t('common.unknown', 'Unknown')

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[var(--color-bg)] text-[var(--color-text-primary)]"
      role="dialog"
      aria-label={isVideo ? t('calls.videoCall') : t('calls.voiceCall')}
    >
      {/* Remote area */}
      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        {isVideo && remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            aria-label={`${remoteName} video`}
          />
        ) : (
          /* Voice call or no video: show avatar */
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center w-24 h-24 rounded-full bg-[var(--color-primary)] text-white text-4xl font-bold">
              {remoteName.charAt(0).toUpperCase()}
            </div>
            <p className="text-xl font-semibold text-white">{remoteName}</p>
          </div>
        )}

        {/* Quality indicator */}
        <div className="absolute top-4 right-4">
          <CallQualityIndicator quality={null} />
        </div>

        {/* Duration / status overlay */}
        <div className="absolute top-4 left-4">
          <p className="text-sm font-medium text-white/80">
            {isConnecting
              ? t('calls.connecting')
              : call.status === 'ringing'
                ? t('calls.calling')
                : formatDuration(callDuration)}
          </p>
        </div>

        {/* Local video picture-in-picture */}
        {isVideo && localStream && !isCameraOff && (
          <div className="absolute bottom-4 right-4 w-28 h-40 rounded-xl overflow-hidden border-2 border-white/30 shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              aria-label={t('calls.yourVideo', 'Your video')}
            />
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-center p-6 bg-[var(--color-surface)]">
        <CallControls
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          callType={call.call_type}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onEndCall={onEndCall}
        />
      </div>
    </div>
  )
}
