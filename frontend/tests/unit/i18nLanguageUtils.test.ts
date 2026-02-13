import {
  getBaseLanguage,
  isRtlLanguage,
  resolveSupportedLanguage,
  syncDocumentLanguageAttributes,
} from '../../src/i18n/languageUtils';

describe('i18n language utils', () => {
  it('normalizes regional language tags to base language', () => {
    expect(getBaseLanguage('en-US')).toBe('en');
    expect(getBaseLanguage('ES-mx')).toBe('es');
  });

  it('falls back to english for unsupported languages', () => {
    expect(resolveSupportedLanguage('pt-BR')).toBe('en');
    expect(resolveSupportedLanguage(undefined)).toBe('en');
  });

  it('detects rtl languages', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('ar-EG')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
  });

  it('updates html lang and dir attributes', () => {
    syncDocumentLanguageAttributes('ar-EG');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');

    syncDocumentLanguageAttributes('en-US');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});
