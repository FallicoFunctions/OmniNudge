import { Mic, MicOff, Camera, CameraOff, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CallControlsProps {
  isMuted: boolean
  isCameraOff: boolean
  callType: 'voice' | 'video'
  onToggleMute: () => void
  onToggleCamera: () => void
  onEndCall: () => void
}

export function CallControls({
  isMuted,
  isCameraOff,
  callType,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: CallControlsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center gap-6">
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

      {/* Camera toggle — voice calls only show if video */}
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
