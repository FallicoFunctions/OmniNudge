import React, { useEffect, useRef, useCallback } from 'react'

interface WaveformVisualizerProps {
  data: number[]
  progress: number
  onSeek?: (progress: number) => void
  isLive?: boolean
  liveLevel?: number
}

const NUM_BARS = 80
const BAR_GAP = 2
const MIN_BAR_HEIGHT = 3

export function WaveformVisualizer({
  data,
  progress,
  onSeek,
  isLive = false,
  liveLevel = 0,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const liveBufferRef = useRef<number[]>(Array(NUM_BARS).fill(0))

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Get CSS variable colors by measuring a dummy element
    const style = getComputedStyle(document.documentElement)
    const primaryColor = style.getPropertyValue('--color-primary').trim() || '#3b82f6'
    const primaryAlpha = primaryColor + '4D' // ~30% opacity

    const barWidth = (width - BAR_GAP * (NUM_BARS - 1)) / NUM_BARS
    const playedCount = Math.round(progress * NUM_BARS)

    let bars: number[]
    if (isLive) {
      // Shift buffer and append new level
      const buf = liveBufferRef.current
      buf.shift()
      buf.push(liveLevel)
      bars = buf
    } else {
      // Downsample/upsample data to NUM_BARS
      bars = Array.from({ length: NUM_BARS }, (_, i) => {
        if (!data || data.length === 0) return 0.1
        const idx = Math.floor((i / NUM_BARS) * data.length)
        return data[idx] ?? 0
      })
    }

    bars.forEach((level, i) => {
      const barHeight = Math.max(MIN_BAR_HEIGHT, level * (height - MIN_BAR_HEIGHT * 2))
      const x = i * (barWidth + BAR_GAP)
      const y = (height - barHeight) / 2

      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2)

      if (!isLive && i < playedCount) {
        ctx.fillStyle = primaryColor
      } else {
        ctx.fillStyle = primaryAlpha
      }
      ctx.fill()
    })
  }, [data, progress, isLive, liveLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width
        canvas.height = entry.contentRect.height
        draw()
      }
    })
    ro.observe(canvas)
    canvas.width = canvas.offsetWidth || 200
    canvas.height = canvas.offsetHeight || 32
    draw()
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const animate = () => {
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const newProgress = Math.max(0, Math.min(1, x / rect.width))
    onSeek(newProgress)
  }, [onSeek])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!onSeek) return
    let delta = 0
    if (e.key === 'ArrowRight') delta = 0.05
    else if (e.key === 'ArrowLeft') delta = -0.05
    else if (e.key === 'Home') { onSeek(0); return }
    else if (e.key === 'End') { onSeek(1); return }
    else return
    e.preventDefault()
    onSeek(Math.max(0, Math.min(1, progress + delta)))
  }, [onSeek, progress])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-8 cursor-pointer"
      style={{ display: 'block' }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onSeek ? 0 : undefined}
      role={onSeek ? 'slider' : undefined}
      aria-label="Voice message waveform"
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
    />
  )
}
