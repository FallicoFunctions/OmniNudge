export const SUPPORTED_LANGUAGES = ['en', 'es', 'ar'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_OPTIONS: Array<{ code: SupportedLanguage; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'ar', name: 'العربية' },
];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const RTL_LANGUAGE_SET = new Set<string>(['ar', 'he', 'fa', 'ur']);

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

export function syncDocumentLanguageAttributes(language: string | null | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  const resolvedLanguage = resolveSupportedLanguage(language);
  const direction = isRtlLanguage(resolvedLanguage) ? 'rtl' : 'ltr';

  document.documentElement.setAttribute('dir', direction);
  document.documentElement.setAttribute('lang', resolvedLanguage);
}
