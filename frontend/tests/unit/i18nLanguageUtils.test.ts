import {
  getBaseLanguage,
  getForcedDocumentDirection,
  isRtlLanguage,
  resolveSupportedLanguage,
  setForcedDocumentDirection,
  syncDocumentLanguageAttributes,
} from '../../src/i18n/languageUtils';

describe('i18n language utils', () => {
  afterEach(() => {
    setForcedDocumentDirection(null);
    document.documentElement.removeAttribute('data-dir-source');
  });

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
    expect(document.documentElement.getAttribute('data-dir-source')).toBe('language');

    syncDocumentLanguageAttributes('en-US');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(document.documentElement.getAttribute('data-dir-source')).toBe('language');
  });

  it('supports forced direction override', () => {
    setForcedDocumentDirection('rtl');
    expect(getForcedDocumentDirection()).toBe('rtl');

    syncDocumentLanguageAttributes('en-US');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('data-dir-source')).toBe('forced');
  });
});
