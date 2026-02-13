import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import { SUPPORTED_LANGUAGES, syncDocumentLanguageAttributes } from './languageUtils';

const isDev = import.meta.env.DEV;
const loggedMissingTranslations = new Set<string>();

function logMissingTranslation(key: string, language: string | readonly string[] | undefined): void {
  if (!isDev) {
    return;
  }

  const resolvedLanguage = Array.isArray(language) ? language[0] : language;
  const languageLabel = resolvedLanguage || 'unknown';
  const cacheKey = `${languageLabel}:${key}`;
  if (loggedMissingTranslations.has(cacheKey)) {
    return;
  }

  loggedMissingTranslations.add(cacheKey);
  console.warn(`[i18n] Missing translation key "${key}" for language "${languageLabel}"`);
}

i18n
  .use(HttpBackend) // Load translations from /locales
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    debug: isDev, // Enable debug in development
    missingKeyHandler: (lng, _ns, key) => {
      logMissingTranslation(key, lng);
    },
    parseMissingKeyHandler: (key) => {
      logMissingTranslation(key, i18n.resolvedLanguage || i18n.language);
      return key;
    },
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    detection: {
      // Detection order
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

function applyLanguageToDocument(language: string | null | undefined): void {
  syncDocumentLanguageAttributes(language);
}

i18n.on('initialized', () => {
  applyLanguageToDocument(i18n.resolvedLanguage || i18n.language || 'en');
});

i18n.on('languageChanged', (lng) => {
  applyLanguageToDocument(lng);
});

applyLanguageToDocument(i18n.resolvedLanguage || i18n.language || 'en');

export default i18n;
