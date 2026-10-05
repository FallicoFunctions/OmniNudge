import { useTranslation } from 'react-i18next';
import { LANGUAGE_OPTIONS, resolveSupportedLanguage } from '../../i18n/languageUtils';

export function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const selectedLanguage = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);

  const handleLanguageChange = (languageCode: (typeof LANGUAGE_OPTIONS)[number]['code']) => {
    i18n.changeLanguage(languageCode);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-text-primary">
        {t('settings.language_label')}
      </label>
      <select
        value={selectedLanguage}
        onChange={(e) =>
          handleLanguageChange(e.target.value as (typeof LANGUAGE_OPTIONS)[number]['code'])
        }
        className="w-full px-3 py-2 border border-border rounded-sm bg-(--color-surface-elevated) text-text-primary focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
      >
        {LANGUAGE_OPTIONS.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-text-secondary">{t('settings.language_help')}</p>
      <p className="mt-4 text-[10px] text-text-secondary opacity-60">
        {t('settings.language_footer')}
      </p>
    </div>
  );
}
