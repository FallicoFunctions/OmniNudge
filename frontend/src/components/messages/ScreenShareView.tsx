import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MonitorOff } from 'lucide-react'

interface ScreenShareViewProps {
  isSharing: boolean
  screenStream: MediaStream | null
  peerIsSharing: boolean
  remoteStream: MediaStream | null
  remoteName: string
  onStopSharing: () => void
}

export function ScreenShareView({
  isSharing,
  screenStream,
  peerIsSharing,
  remoteStream,
  remoteName,
  onStopSharing,
}: ScreenShareViewProps) {
  const { t } = useTranslation()
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localPreviewRef = useRef<HTMLVideoElement>(null)

  // Attach remote stream to main view.
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && peerIsSharing) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream, peerIsSharing])

  // Attach local screen stream to preview.
  useEffect(() => {
    if (localPreviewRef.current && screenStream && isSharing) {
      localPreviewRef.current.srcObject = screenStream
    }
  }, [screenStream, isSharing])

  if (!isSharing && !peerIsSharing) return null

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black">
      {/* Main area: peer screen share or local sharing indicator */}
      {peerIsSharing ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
          aria-label={t('calls.peerIsSharing', { name: remoteName })}
        />
      ) : (
        /* Local sharing, no remote share — show indicator */
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-white text-lg font-semibold">
            {t('calls.youAreSharing')}
          </p>
          {isSharing && screenStream && (
            <video
              ref={localPreviewRef}
              autoPlay
              playsInline
              muted
              className="max-w-xs rounded-xl border border-white/20 shadow-lg"
              aria-label={t('calls.youAreSharing')}
            />
          )}
        </div>
      )}

      {/* If both sharing: show local as PiP overlay */}
      {peerIsSharing && isSharing && screenStream && (
        <div className="absolute bottom-4 right-4 w-32 h-24 rounded-xl overflow-hidden border border-white/30 shadow-lg">
          <video
            ref={localPreviewRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            aria-label={t('calls.youAreSharing')}
          />
        </div>
      )}

      {/* Peer sharing label */}
      {peerIsSharing && (
        <div className="absolute top-4 left-4 bg-black/50 rounded-md px-3 py-1">
          <p className="text-white text-sm font-medium">
            {t('calls.peerIsSharing', { name: remoteName })}
          </p>
        </div>
      )}

      {/* Stop sharing button (shown when locally sharing) */}
      {isSharing && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={onStopSharing}
            aria-label={t('calls.stopSharing')}
            className="flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-full bg-[var(--color-error)] text-white font-semibold text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
          >
            <MonitorOff className="w-4 h-4" />
            {t('calls.stopSharing')}
          </button>
        </div>
      )}
    </div>
  )
}
