import { useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CameraFlipButtonProps {
  cameraDevices: MediaDeviceInfo[]
  selectedCameraId: string | null
  switchCamera: (deviceId: string) => Promise<void>
}

function useIsMobile(): boolean {
  return typeof window !== 'undefined' && 'ontouchstart' in window
}

export function CameraFlipButton({
  cameraDevices,
  selectedCameraId,
  switchCamera,
}: CameraFlipButtonProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [isFlipping, setIsFlipping] = useState(false)

  const handleFlip = useCallback(async () => {
    if (cameraDevices.length < 2 || isFlipping) return

    const currentIndex = cameraDevices.findIndex((d) => d.deviceId === selectedCameraId)
    const nextIndex = (currentIndex + 1) % cameraDevices.length
    const nextDevice = cameraDevices[nextIndex]
    if (!nextDevice) return

    setIsFlipping(true)
    try {
      await switchCamera(nextDevice.deviceId)
    } finally {
      setIsFlipping(false)
    }
  }, [cameraDevices, selectedCameraId, switchCamera, isFlipping])

  // Only show on mobile and when there are multiple cameras.
  if (!isMobile || cameraDevices.length < 2) return null

  return (
    <button
      onClick={handleFlip}
      disabled={isFlipping}
      aria-label={t('calls.flipCamera')}
      className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
    >
      <RefreshCw
        className={`w-6 h-6 text-[var(--color-text-primary)] ${isFlipping ? 'animate-spin' : ''}`}
      />
    </button>
  )
}
