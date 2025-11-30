import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: (id: string) => void;
}

const Toast = ({ id, message, type = 'info', duration = 3000, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const bgColorMap: Record<ToastType, string> = {
    success: 'var(--color-success)',
    error: 'var(--color-error)',
    warning: 'var(--color-warning)',
    info: 'var(--color-info)',
  };

  const iconMap: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return createPortal(
    <div
      className="pointer-events-auto fixed right-4 z-50 flex min-w-[320px] max-w-md items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-xl animate-slide-in-right"
      role="alert"
      aria-live="polite"
      style={{
        animation: 'slideInRight 0.3s ease-out',
      }}
    >
      <div
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: bgColorMap[type] }}
      >
        {iconMap[type]}
      </div>
      <p className="flex-1 text-sm font-medium text-[var(--color-text-primary)]">{message}</p>
      <button
        type="button"
        className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        onClick={() => onClose(id)}
        aria-label="Close notification"
      >
        ✕
      </button>
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default Toast;
