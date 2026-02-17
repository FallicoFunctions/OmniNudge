import { useState, useCallback, useEffect } from 'react';
import type { ToastType } from '../components/error/Toast';

interface ToastOptions {
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

export interface Toast extends ToastOptions {
  id: string;
}

let toastId = 0;

// Global toast state (simple alternative to context)
let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function emitChange() {
  toastListeners.forEach((listener) => listener(toasts));
}

function addToast(options: ToastOptions): string {
  const id = `toast-${++toastId}`;
  const toast: Toast = { ...options, id };

  toasts = [...toasts, toast];
  emitChange();

  return id;
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emitChange();
}

export function dismissToast(id: string) {
  removeToast(id);
}

// Hook for using toasts
export function useToast() {
  const [, setToasts] = useState<Toast[]>(toasts);

  // Subscribe to toast changes on mount
  const subscribe = useCallback(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setToasts);
    };
  }, []);

  useEffect(subscribe, [subscribe]);

  const toast = {
    success: (message: string, description?: string, duration?: number) => {
      return addToast({ type: 'success', message, description, duration });
    },
    error: (message: string, description?: string, duration?: number) => {
      return addToast({ type: 'error', message, description, duration });
    },
    warning: (message: string, description?: string, duration?: number) => {
      return addToast({ type: 'warning', message, description, duration });
    },
    info: (message: string, description?: string, duration?: number) => {
      return addToast({ type: 'info', message, description, duration });
    },
    dismiss: (id: string) => {
      removeToast(id);
    },
  };

  return { toast, toasts };
}

// Helper to get current toasts (for ToastContainer)
export function useToasts() {
  const [currentToasts, setToasts] = useState<Toast[]>(toasts);

  const subscribe = useCallback(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setToasts);
    };
  }, []);

  useEffect(subscribe, [subscribe]);

  return currentToasts;
}
