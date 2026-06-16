import React, { useEffect, useRef, useCallback } from 'react';

interface WaveformVisualizerProps {
  data: number[];
  progress: number;
  onSeek?: (progress: number) => void;
  isLive?: boolean;
  liveLevel?: number;
}

const NUM_BARS = 80;
const BAR_GAP = 2;
const MIN_BAR_HEIGHT = 3;

/** Polyfill for ctx.roundRect — not available on iOS Safari < 15.4 */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
}

export function WaveformVisualizer({
  data,
  progress,
  onSeek,
  isLive = false,
  liveLevel = 0,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const liveBufferRef = useRef<number[]>(Array(NUM_BARS).fill(0));
  // Cache colors on mount — reading computed styles on every frame forces style recalc
  const colorsRef = useRef<{ primary: string; faded: string } | null>(null);

  const getColors = useCallback(() => {
    if (!colorsRef.current) {
      const style = getComputedStyle(document.documentElement);
      const primary = style.getPropertyValue('--color-primary').trim() || '#3b82f6';
      colorsRef.current = { primary, faded: primary + '4D' }; // ~30% opacity
    }
    return colorsRef.current;
  }, []);

  // Invalidate color cache when theme changes (theme toggle adds/removes class on <html>)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      colorsRef.current = null;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const { primary, faded } = getColors();
    const barWidth = (width - BAR_GAP * (NUM_BARS - 1)) / NUM_BARS;
    const playedCount = Math.round(progress * NUM_BARS);

    let bars: number[];
    if (isLive) {
      const buf = liveBufferRef.current;
      buf.shift();
      buf.push(liveLevel);
      bars = buf;
    } else {
      bars = Array.from({ length: NUM_BARS }, (_, i) => {
        if (!data || data.length === 0) return 0.1;
        const idx = Math.floor((i / NUM_BARS) * data.length);
        return data[idx] ?? 0;
      });
    }

    bars.forEach((level, i) => {
      const barHeight = Math.max(MIN_BAR_HEIGHT, level * (height - MIN_BAR_HEIGHT * 2));
      const x = i * (barWidth + BAR_GAP);
      const y = (height - barHeight) / 2;

      ctx.fillStyle = !isLive && i < playedCount ? primary : faded;
      fillRoundRect(ctx, x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    });
  }, [data, progress, isLive, liveLevel, getColors]);

  // ResizeObserver — keeps canvas pixel-accurate when container resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
        draw();
      }
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth || 200;
    canvas.height = canvas.offsetHeight || 32;
    draw();
    return () => ro.disconnect();
  }, [draw]);

  // rAF loop — ONLY when live (recording visualization). Static waveforms draw on prop change above.
  useEffect(() => {
    if (!isLive) return;
    const animate = () => {
      draw();
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isLive, draw]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      onSeek(Math.max(0, Math.min(1, x / rect.width)));
    },
    [onSeek]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!onSeek) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSeek(Math.max(0, Math.min(1, progress + 0.05)));
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSeek(Math.max(0, Math.min(1, progress - 0.05)));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        onSeek(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        onSeek(1);
        return;
      }
    },
    [onSeek, progress]
  );

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
  );
}
