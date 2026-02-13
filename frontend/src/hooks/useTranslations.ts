import { useTranslation } from 'react-i18next';
import { resolveSupportedLanguage } from '../i18n/languageUtils';

/**
 * Hook for accessing translations with type safety
 * Usage:
 * const { t } = useTranslations();
 * <button>{t('common.save')}</button>
 * <p>{t('messages.comment', { count: 5 })}</p>
 */
export function useTranslations() {
  const { t, i18n } = useTranslation();
  const currentLanguage = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);

  return {
    t,
    currentLanguage,
    changeLanguage: (lang: string) => i18n.changeLanguage(lang),
  };
}

// Convenience exports for common translations
export function useCommonTranslations() {
  const { t } = useTranslation();

  return {
    loading: t('common.loading'),
    error: t('common.error'),
    success: t('common.success'),
    cancel: t('common.cancel'),
    save: t('common.save'),
    delete: t('common.delete'),
    edit: t('common.edit'),
    submit: t('common.submit'),
    close: t('common.close'),
  };
}
