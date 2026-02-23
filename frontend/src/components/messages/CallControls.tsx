import { Mic, MicOff, Camera, CameraOff, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CameraFlipButton } from './CameraFlipButton'
import { ScreenShareButton } from './ScreenShareButton'

interface CallControlsProps {
  isMuted: boolean
  isCameraOff: boolean
  callType: 'voice' | 'video'
  callId: number | null
  isCallActive: boolean
  // F13: camera flip
  cameraDevices: MediaDeviceInfo[]
  selectedCameraId: string | null
  onSwitchCamera: (deviceId: string) => Promise<void>
  // F14: screen sharing
  isSharing: boolean
  peerIsSharing: boolean
  onStartSharing: () => Promise<void>
  onStopSharing: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
  onEndCall: () => void
}

export function CallControls({
  isMuted,
  isCameraOff,
  callType,
  callId,
  isCallActive,
  cameraDevices,
  selectedCameraId,
  onSwitchCamera,
  isSharing,
  peerIsSharing,
  onStartSharing,
  onStopSharing,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: CallControlsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center gap-4 flex-wrap">
      {/* Mute / Unmute */}
      <button
        onClick={onToggleMute}
        aria-label={isMuted ? t('calls.unmute') : t('calls.mute')}
        className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        {isMuted ? (
          <MicOff className="w-6 h-6 text-[var(--color-error)]" />
        ) : (
          <Mic className="w-6 h-6 text-[var(--color-text-primary)]" />
        )}
      </button>

      {/* Camera toggle — video calls only */}
      {callType === 'video' && (
        <button
          onClick={onToggleCamera}
          aria-label={isCameraOff ? t('calls.cameraOn') : t('calls.cameraOff')}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          {isCameraOff ? (
            <CameraOff className="w-6 h-6 text-[var(--color-error)]" />
          ) : (
            <Camera className="w-6 h-6 text-[var(--color-text-primary)]" />
          )}
        </button>
      )}

      {/* Camera flip (mobile, video calls only) — F13 */}
      {callType === 'video' && (
        <CameraFlipButton
          cameraDevices={cameraDevices}
          selectedCameraId={selectedCameraId}
          switchCamera={onSwitchCamera}
        />
      )}

      {/* Screen share — F14 */}
      <ScreenShareButton
        isSharing={isSharing}
        peerIsSharing={peerIsSharing}
        callId={callId}
        isCallActive={isCallActive}
        onStartSharing={onStartSharing}
        onStopSharing={onStopSharing}
      />

      {/* End Call */}
      <button
        onClick={onEndCall}
        aria-label={t('calls.endCall')}
        className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-error)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
      >
        <PhoneOff className="w-6 h-6 text-white" />
      </button>
    </div>
  )
}
