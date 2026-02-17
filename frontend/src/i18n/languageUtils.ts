export const SUPPORTED_LANGUAGES = ['en', 'es', 'ar'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_OPTIONS: Array<{ code: SupportedLanguage; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'ar', name: 'العربية' },
];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const RTL_LANGUAGE_SET = new Set<string>(['ar', 'he', 'fa', 'ur']);
const FORCED_DIRECTION_STORAGE_KEY = 'omni_dev_forced_direction';
export type DocumentDirection = 'ltr' | 'rtl';

export function getBaseLanguage(language: string | null | undefined): string {
  if (!language) {
    return 'en';
  }

  return language.toLowerCase().split('-')[0];
}

export function resolveSupportedLanguage(language: string | null | undefined): SupportedLanguage {
  const baseLanguage = getBaseLanguage(language);
  if (SUPPORTED_LANGUAGE_SET.has(baseLanguage)) {
    return baseLanguage as SupportedLanguage;
  }

  return 'en';
}

export function isRtlLanguage(language: string | null | undefined): boolean {
  return RTL_LANGUAGE_SET.has(getBaseLanguage(language));
}

export function getForcedDocumentDirection(): DocumentDirection | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(FORCED_DIRECTION_STORAGE_KEY);
  if (value === 'ltr' || value === 'rtl') {
    return value;
  }

  return null;
}

export function setForcedDocumentDirection(direction: DocumentDirection | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (direction === null) {
    window.localStorage.removeItem(FORCED_DIRECTION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(FORCED_DIRECTION_STORAGE_KEY, direction);
}

export function syncDocumentLanguageAttributes(language: string | null | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  const resolvedLanguage = resolveSupportedLanguage(language);
  const forcedDirection = getForcedDocumentDirection();
  const direction = forcedDirection ?? (isRtlLanguage(resolvedLanguage) ? 'rtl' : 'ltr');

  document.documentElement.setAttribute('dir', direction);
  document.documentElement.setAttribute('lang', resolvedLanguage);
  document.documentElement.setAttribute(
    'data-dir-source',
    forcedDirection ? 'forced' : 'language'
  );
}
