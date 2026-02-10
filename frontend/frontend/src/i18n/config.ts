/**
 * P0-020/P0-021: i18n Configuration
 *
 * Internationalization setup using i18next and react-i18next.
 * Supports language detection and runtime locale switching.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';

// Available resources
const resources = {
  en: {
    translation: en,
  },
};

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,
    fallbackLng: 'en',
    debug: import.meta.env.DEV,

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      // Order of language detection
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Cache user language
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    // Namespace configuration
    defaultNS: 'translation',
    ns: ['translation'],

    // Return keys if translation missing (useful for development)
    returnEmptyString: false,
    returnNull: false,
  });

export default i18n;
