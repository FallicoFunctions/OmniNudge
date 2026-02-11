import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'ar', name: 'العربية' },
  // { code: 'fr', name: 'Français' },
  // { code: 'de', name: 'Deutsch' },
  // { code: 'zh', name: '中文' },
  // { code: 'ja', name: '日本語' },
];

export function LanguageSelector() {
  const { i18n, t } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-[var(--color-text-primary)]">
        {t('settings.language_label')}
      </label>
      <select
        value={i18n.language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {t('settings.language_help')}
      </p>
      <p className="mt-4 text-[10px] text-[var(--color-text-secondary)] opacity-60">
        {t('settings.language_footer')}
      </p>
    </div>
  );
}
