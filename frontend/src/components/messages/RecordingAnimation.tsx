import React from 'react'

interface RecordingAnimationProps {
  audioLevel: number
}

export function RecordingAnimation({ audioLevel }: RecordingAnimationProps) {
  const scale = 1 + audioLevel * 0.5

  return (
    <div className="relative flex items-center justify-center w-8 h-8 flex-shrink-0">
      {/* Outer ring — scales with audio level */}
      <div
        className="absolute rounded-full transition-transform duration-75"
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${scale})`,
          backgroundColor: 'color-mix(in srgb, var(--color-error) 25%, transparent)',
        }}
      />
      {/* Pulsing red dot */}
      <div
        className="w-3 h-3 rounded-full animate-pulse"
        style={{ backgroundColor: 'var(--color-error)' }}
      />
    </div>
  )
}
