import { createInstance } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('i18next');
  vi.doUnmock('i18next-browser-languagedetector');
  vi.doUnmock('i18next-http-backend');
  vi.doUnmock('./languageUtils');
});

async function initialize(language: string) {
  vi.resetModules();
  const instance = createInstance();
  const requests: string[] = [];
  vi.doMock('i18next', () => ({ default: instance }));
  // Only English is currently shipped. Exercise the backend boundary as it
  // will behave when another language is added to the supported registry.
  vi.doMock('./languageUtils', async () => ({
    ...(await vi.importActual<typeof import('./languageUtils')>('./languageUtils')),
    SUPPORTED_LANGUAGES: ['en', 'de'],
  }));
  vi.doMock('i18next-browser-languagedetector', () => ({
    default: {
      type: 'languageDetector',
      init() {},
      detect: () => language,
      cacheUserLanguage() {},
    },
  }));
  vi.doMock('i18next-http-backend', () => ({
    default: {
      type: 'backend',
      init() {},
      read(locale: string, _namespace: string, callback: (error: null, data: object) => void) {
        requests.push(locale);
        callback(null, { common: { loading: 'Lokales geladen' } });
      },
    },
  }));
  const { i18nReady } = await import('./config');
  await i18nReady;
  return { instance, requests };
}

describe('translation bootstrap', () => {
  it('renders English without a blocking locale fetch', async () => {
    const { instance, requests } = await initialize('en');
    expect(requests).toEqual([]);
    expect(instance.t('common.loading')).not.toBe('common.loading');
    expect(instance.resolvedLanguage).toBe('en');
  });

  it('loads a detected non-English locale while retaining the English fallback', async () => {
    const { instance, requests } = await initialize('de');
    expect(requests).toEqual(['de']);
    expect(instance.t('common.loading')).toBe('Lokales geladen');
    expect(instance.hasResourceBundle('en', 'translation')).toBe(true);
    expect(instance.resolvedLanguage).toBe('de');
  });
});
