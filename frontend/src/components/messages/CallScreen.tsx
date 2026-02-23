import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CallControls } from './CallControls'
import { CallQualityIndicator } from './CallQualityIndicator'
import { VideoQualitySelector } from './VideoQualitySelector'
import { ScreenShareView } from './ScreenShareView'
import { useScreenShare } from '../../hooks/useScreenShare'
import type { Call } from '../../types/calls'
import type { VideoQuality } from '../../types/calls'

interface CallScreenProps {
  call: Call
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isCameraOff: boolean
  callDuration: number
  isConnecting?: boolean
  // Issue 4: real quality value from useCallManager
  callQuality?: 'excellent' | 'good' | 'fair' | 'poor' | null
  // F13
  cameraDevices: MediaDeviceInfo[]
  selectedCameraId: string | null
  videoQuality: VideoQuality
  onSwitchCamera: (deviceId: string) => Promise<void>
  onSetVideoQuality: (q: VideoQuality) => void
  // F14
  peerIsSharing: boolean
  peerConnection: RTCPeerConnection | null
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
  callQuality = null,
  cameraDevices,
  selectedCameraId,
  videoQuality,
  onSwitchCamera,
  onSetVideoQuality,
  peerIsSharing,
  peerConnection,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: CallScreenProps) {
  const { t } = useTranslation()
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  const { isSharing, screenStream, startSharing, stopSharing } = useScreenShare(
    call.id,
    peerConnection,
  )

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
  const isCallActive = call.status === 'active'

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[var(--color-bg)] text-[var(--color-text-primary)]"
      role="dialog"
      aria-label={isVideo ? t('calls.videoCall') : t('calls.voiceCall')}
    >
      {/* Issue 5: aria-live region for screen-reader call status announcements */}
      <div aria-live="polite" className="sr-only">
        {isConnecting ? t('calls.connecting') : isCallActive ? t('calls.callActive') : ''}
      </div>

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
            {/* Issue 5: add role="img" and aria-label to avatar */}
            <div
              className="flex items-center justify-center w-24 h-24 rounded-full bg-[var(--color-primary)] text-white text-4xl font-bold"
              role="img"
              aria-label={t('calls.remoteUserAvatar', { name: remoteName })}
            >
              {remoteName.charAt(0).toUpperCase()}
            </div>
            <p className="text-xl font-semibold text-white">{remoteName}</p>
          </div>
        )}

        {/* Screen share overlay — replaces/overlays main video area when active */}
        <ScreenShareView
          isSharing={isSharing}
          screenStream={screenStream}
          peerIsSharing={peerIsSharing}
          remoteStream={remoteStream}
          remoteName={remoteName}
          onStopSharing={stopSharing}
        />

        {/* Quality indicator */}
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          {/* Issue 4: pass real callQuality instead of hardcoded null */}
          <CallQualityIndicator quality={callQuality} />
          {/* F13: Video quality selector — only for video calls */}
          {isVideo && isCallActive && (
            <VideoQualitySelector
              videoQuality={videoQuality}
              setVideoQuality={onSetVideoQuality}
            />
          )}
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
        {isVideo && localStream && !isCameraOff && !isSharing && !peerIsSharing && (
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
          callId={call.id}
          isCallActive={isCallActive}
          cameraDevices={cameraDevices}
          selectedCameraId={selectedCameraId}
          onSwitchCamera={onSwitchCamera}
          isSharing={isSharing}
          peerIsSharing={peerIsSharing}
          onStartSharing={startSharing}
          onStopSharing={stopSharing}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onEndCall={onEndCall}
        />
      </div>
    </div>
  )
}
