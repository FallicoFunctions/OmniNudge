import { Monitor, MonitorOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ScreenShareButtonProps {
  isSharing: boolean
  peerIsSharing: boolean
  callId: number | null
  isCallActive: boolean
  onStartSharing: () => Promise<void>
  onStopSharing: () => void
}

export function ScreenShareButton({
  isSharing,
  peerIsSharing,
  callId,
  isCallActive,
  onStartSharing,
  onStopSharing,
}: ScreenShareButtonProps) {
  const { t } = useTranslation()

  const isDisabled = !callId || !isCallActive

  const handleClick = () => {
    if (isSharing) {
      onStopSharing()
    } else {
      onStartSharing()
    }
  }

  return (
    <div className="relative flex flex-col items-center">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={isSharing ? t('calls.stopSharing') : t('calls.shareScreen')}
        aria-pressed={isSharing}
        className={`flex items-center justify-center w-14 h-14 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed ${
          isSharing
            ? 'bg-[var(--color-error)] hover:opacity-90'
            : 'bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]'
        }`}
      >
        {isSharing ? (
          <MonitorOff className="w-6 h-6 text-white" />
        ) : (
          <Monitor className="w-6 h-6 text-[var(--color-text-primary)]" />
        )}
        {isSharing && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--color-error)] animate-pulse" />
        )}
      </button>

      {/* Peer sharing indicator */}
      {peerIsSharing && !isSharing && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--color-primary)]" />
      )}
    </div>
  )
}
