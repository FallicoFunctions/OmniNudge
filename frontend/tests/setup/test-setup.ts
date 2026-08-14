import '@testing-library/jest-dom';
import { act } from '@testing-library/react';
import { notifyManager } from '@tanstack/react-query';
import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../public/locales/en.json';
import es from '../../public/locales/es.json';
import ar from '../../public/locales/ar.json';

vi.mock('../../src/services/userSettingsService', () => ({
  userSettingsService: {
    get: vi.fn(async () => ({
      show_read_receipts: true,
      show_typing_indicators: true,
      show_last_seen: true,
      notification_sound: true,
    })),
    update: vi.fn(async (updates: Record<string, unknown>) => ({
      show_read_receipts: true,
      show_typing_indicators: true,
      show_last_seen: true,
      notification_sound: true,
      ...updates,
    })),
  },
}));

// React Query publishes async observer updates outside React events. Route
// them through act so test assertions observe the same settled UI users do.
notifyManager.setNotifyFunction((callback) => {
  act(callback);
});

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      es: { translation: es },
      ar: { translation: ar },
    },
    interpolation: {
      escapeValue: false,
    },
    showSupportNotice: false,
  });
}

// Polyfill Web Crypto API
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// Polyfill File.arrayBuffer() for Node environment
if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = async function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:test-object-url');
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom provides these APIs but may throw "Not implemented" when called.
// Tests should stub per-test when asserting behavior; this just prevents noisy stderr.
window.alert = vi.fn();
window.confirm = vi.fn(() => true);
window.scrollTo = vi.fn();
