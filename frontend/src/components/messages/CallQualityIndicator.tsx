type Quality = 'excellent' | 'good' | 'fair' | 'poor' | null | undefined

interface CallQualityIndicatorProps {
  quality: Quality
}

const QUALITY_BARS: Record<NonNullable<Quality>, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
}

const QUALITY_COLORS: Record<NonNullable<Quality>, string> = {
  excellent: 'var(--color-success, #22c55e)',
  good: 'var(--color-success, #22c55e)',
  fair: '#f59e0b',
  poor: 'var(--color-error)',
}

export function CallQualityIndicator({ quality }: CallQualityIndicatorProps) {
  if (!quality) return null

  const bars = QUALITY_BARS[quality]
  const color = QUALITY_COLORS[quality]

  return (
    <div className="flex items-end gap-0.5" aria-label={`Call quality: ${quality}`}>
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          style={{
            width: 3,
            height: 4 + bar * 3,
            borderRadius: 1,
            backgroundColor: bar <= bars ? color : 'var(--color-border)',
          }}
        />
      ))}
    </div>
  )
}
