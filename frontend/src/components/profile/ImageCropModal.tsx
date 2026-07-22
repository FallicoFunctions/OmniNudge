import { useCallback, useEffect, useRef, useState } from 'react';

interface ImageCropModalProps {
  src: string;
  /** width / height ratio of the crop frame, e.g. 1 for square, 3 for banner */
  aspect: number;
  /** Visual shape of the crop indicator (does NOT affect output shape) */
  shape?: 'circle' | 'rect';
  /** Output canvas dimensions */
  outputWidth: number;
  outputHeight: number;
  title: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

interface DragState {
  startClientX: number;
  startClientY: number;
  startImgX: number;
  startImgY: number;
}

// Canvas layout constants
const CANVAS_SIDE_GUTTER = 40; // px of dark overlay around the crop frame
const MIN_ZOOM = 0.5; // relative to the "fill frame" scale
const MAX_ZOOM = 5;

export default function ImageCropModal({
  src,
  aspect,
  shape = 'rect',
  outputWidth,
  outputHeight,
  title,
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Mutable crop state — never triggers re-renders, only redraws
  const cropState = useRef({ x: 0, y: 0, scale: 1, minScale: 0.1 });
  const drag = useRef<DragState | null>(null);
  const lastPinchDist = useRef<number | null>(null);

  // Derive canvas and frame dimensions
  const frameMaxW = 520;
  const frameMaxH = 380;
  const fw = Math.min(frameMaxW, frameMaxH * aspect);
  const fh = fw / aspect;
  const CANVAS_W = Math.round(fw + CANVAS_SIDE_GUTTER * 2);
  const CANVAS_H = Math.round(fh + CANVAS_SIDE_GUTTER * 2);
  const frameCX = CANVAS_W / 2;
  const frameCY = CANVAS_H / 2;

  // ── Drawing ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y, scale } = cropState.current;

    // Clear
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Image
    ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale);

    // Overlay with crop cutout
    const overlay = document.createElement('canvas');
    overlay.width = CANVAS_W;
    overlay.height = CANVAS_H;
    const oc = overlay.getContext('2d')!;
    oc.fillStyle = 'rgba(0,0,0,0.55)';
    oc.fillRect(0, 0, CANVAS_W, CANVAS_H);
    oc.globalCompositeOperation = 'destination-out';
    if (shape === 'circle') {
      oc.beginPath();
      oc.arc(frameCX, frameCY, fw / 2, 0, Math.PI * 2);
      oc.fill();
    } else {
      oc.fillRect(frameCX - fw / 2, frameCY - fh / 2, fw, fh);
    }
    oc.globalCompositeOperation = 'source-over';
    // Border
    oc.strokeStyle = 'rgba(255,255,255,0.85)';
    oc.lineWidth = 2;
    if (shape === 'circle') {
      oc.beginPath();
      oc.arc(frameCX, frameCY, fw / 2, 0, Math.PI * 2);
      oc.stroke();
      // Rule-of-thirds guides inside circle
      oc.strokeStyle = 'rgba(255,255,255,0.25)';
      oc.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        const gx = frameCX - fw / 2 + (fw * i) / 3;
        const gy = frameCY - fw / 2 + (fw * i) / 3;
        oc.beginPath();
        oc.moveTo(gx, frameCY - fw / 2);
        oc.lineTo(gx, frameCY + fw / 2);
        oc.stroke();
        oc.beginPath();
        oc.moveTo(frameCX - fw / 2, gy);
        oc.lineTo(frameCX + fw / 2, gy);
        oc.stroke();
      }
    } else {
      oc.strokeRect(frameCX - fw / 2, frameCY - fh / 2, fw, fh);
      // Rule-of-thirds guides
      oc.strokeStyle = 'rgba(255,255,255,0.25)';
      oc.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        const gx = frameCX - fw / 2 + (fw * i) / 3;
        const gy = frameCY - fh / 2 + (fh * i) / 3;
        oc.beginPath();
        oc.moveTo(gx, frameCY - fh / 2);
        oc.lineTo(gx, frameCY + fh / 2);
        oc.stroke();
        oc.beginPath();
        oc.moveTo(frameCX - fw / 2, gy);
        oc.lineTo(frameCX + fw / 2, gy);
        oc.stroke();
      }
    }
    ctx.drawImage(overlay, 0, 0);
  }, [CANVAS_H, CANVAS_W, fh, fw, frameCX, frameCY, loaded, shape]);

  // ── Image load ───────────────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Initial scale: fill the crop frame (cover)
      const fillScale = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
      const minScale = fillScale * MIN_ZOOM;
      cropState.current = {
        scale: fillScale,
        x: frameCX - (img.naturalWidth * fillScale) / 2,
        y: frameCY - (img.naturalHeight * fillScale) / 2,
        minScale,
      };
      setLoaded(true);
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src, fw, fh, frameCX, frameCY]);

  useEffect(() => {
    draw();
  }, [draw, loaded]);

  // ── Constraint helpers ────────────────────────────────────────────────────
  const clampScale = (s: number) =>
    Math.min(
      (MAX_ZOOM * cropState.current.minScale) / MIN_ZOOM,
      Math.max(cropState.current.minScale, s)
    );

  const applyZoom = useCallback(
    (delta: number, pivotX: number, pivotY: number) => {
      const cs = cropState.current;
      const newScale = clampScale(cs.scale * delta);
      const actualDelta = newScale / cs.scale;
      cs.x = pivotX + (cs.x - pivotX) * actualDelta;
      cs.y = pivotY + (cs.y - pivotY) * actualDelta;
      cs.scale = newScale;
      draw();
    },
    [draw]
  );

  // ── Mouse events ──────────────────────────────────────────────────────────
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drag.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startImgX: cropState.current.x,
      startImgY: cropState.current.y,
    };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    cropState.current.x = drag.current.startImgX + e.clientX - drag.current.startClientX;
    cropState.current.y = drag.current.startImgY + e.clientY - drag.current.startClientY;
    draw();
  };

  const onMouseUp = () => {
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getCanvasPos(e as unknown as React.MouseEvent<HTMLCanvasElement>);
    const delta = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    applyZoom(delta, pos.x, pos.y);
  };

  // ── Touch events ──────────────────────────────────────────────────────────
  const getCanvasTouchPos = (touch: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
  };

  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      drag.current = {
        startClientX: e.touches[0].clientX,
        startClientY: e.touches[0].clientY,
        startImgX: cropState.current.x,
        startImgY: cropState.current.y,
      };
      lastPinchDist.current = null;
    } else if (e.touches.length === 2) {
      drag.current = null;
      lastPinchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length === 1 && drag.current) {
      cropState.current.x =
        drag.current.startImgX + e.touches[0].clientX - drag.current.startClientX;
      cropState.current.y =
        drag.current.startImgY + e.touches[0].clientY - drag.current.startClientY;
      draw();
    } else if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const pivotX = (getCanvasTouchPos(e.touches[0]).x + getCanvasTouchPos(e.touches[1]).x) / 2;
      const pivotY = (getCanvasTouchPos(e.touches[0]).y + getCanvasTouchPos(e.touches[1]).y) / 2;
      applyZoom(dist / lastPinchDist.current, pivotX, pivotY);
      lastPinchDist.current = dist;
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) lastPinchDist.current = null;
    if (e.touches.length === 0) drag.current = null;
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    setExporting(true);

    const { x, y, scale } = cropState.current;
    // Crop frame top-left in canvas coords
    const cropLeft = frameCX - fw / 2;
    const cropTop = frameCY - fh / 2;
    // Corresponding source coords in the original image
    const srcX = (cropLeft - x) / scale;
    const srcY = (cropTop - y) / scale;
    const srcW = fw / scale;
    const srcH = fh / scale;

    const out = document.createElement('canvas');
    out.width = outputWidth;
    out.height = outputHeight;
    const octx = out.getContext('2d')!;

    octx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outputWidth, outputHeight);

    out.toBlob(
      (blob) => {
        setExporting(false);
        if (!blob) return;
        onConfirm(new File([blob], 'crop.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Drag to reposition · Scroll or pinch to zoom
          </p>
        </div>

        {/* Canvas */}
        <div className="flex items-center justify-center bg-[#111] p-0">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="block w-full cursor-grab active:cursor-grabbing"
            style={{ maxHeight: '60vh', objectFit: 'contain' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!loaded || exporting}
            className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? 'Applying…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
