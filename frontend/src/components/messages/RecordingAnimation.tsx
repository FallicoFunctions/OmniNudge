import React from 'react'

interface RecordingAnimationProps {
  audioLevel: number
}

export function RecordingAnimation({ audioLevel }: RecordingAnimationProps) {
  // Outer ring scales 1.0–1.6 with audio level
  const ringScale = 1 + audioLevel * 0.6
  // Inner dot opacity 0.6–1.0 with audio level (gives breathing feel)
  const dotOpacity = 0.6 + audioLevel * 0.4

  return (
    <div className="relative flex items-center justify-center w-8 h-8 flex-shrink-0" aria-hidden>
      {/* Outer ring — scales with audio level */}
      <div
        className="absolute rounded-full"
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${ringScale})`,
          transition: 'transform 75ms ease-out',
          backgroundColor: 'color-mix(in srgb, var(--color-error) 25%, transparent)',
        }}
      />
      {/* Inner dot — brightness driven by audio level, not fixed CSS animation */}
      <div
        className="w-3 h-3 rounded-full"
        style={{
          backgroundColor: 'var(--color-error)',
          opacity: dotOpacity,
          transition: 'opacity 75ms ease-out',
        }}
      />
    </div>
  )
}
