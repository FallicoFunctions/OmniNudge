import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThemeSelector from '../themes/ThemeSelector';
import { useTheme } from '../../hooks/useTheme';
import { useFormat } from '../../hooks/useFormat';
import { LoadingMessage } from '../common/StatusMessage';
import { EmptyState } from '../empty';

interface ThemeSettingsSectionProps {
  onCreateTheme: () => void;
  onManageThemes: () => void;
}

const ThemeSettingsSection = ({ onCreateTheme, onManageThemes }: ThemeSettingsSectionProps) => {
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const { activeTheme, isLoading, userSettings, setAdvancedMode } = useTheme();
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(
    userSettings?.advanced_mode_enabled ?? false
  );
  const [advancedModePending, setAdvancedModePending] = useState(false);
  const [advancedModeError, setAdvancedModeError] = useState<string | null>(null);

  useEffect(() => {
    setAdvancedModeEnabled(userSettings?.advanced_mode_enabled ?? false);
  }, [userSettings]);

  const handleAdvancedModeToggle = async (enabled: boolean) => {
    const previousValue = advancedModeEnabled;
    setAdvancedModeError(null);
    setAdvancedModeEnabled(enabled);
    setAdvancedModePending(true);
    try {
      await setAdvancedMode(enabled);
    } catch {
      setAdvancedModeError(t('settings.themeSettingsSection.advancedMode.errorUpdateFailed'));
      setAdvancedModeEnabled(previousValue);
    } finally {
      setAdvancedModePending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-md">
      <header className="flex flex-col gap-2 border-b border-dashed border-[var(--color-border)] pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('settings.themeSettingsSection.header.label')}
          </p>
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t('settings.themeSettingsSection.header.title')}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.themeSettingsSection.header.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
            onClick={onManageThemes}
          >
            {t('settings.themeSettingsSection.actions.manageThemes')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
            onClick={onCreateTheme}
          >
            {t('settings.themeSettingsSection.actions.createTheme')}
          </button>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('settings.themeSettingsSection.activeTheme.label')}
          </p>
          {isLoading ? (
            <LoadingMessage className="mt-2 text-sm">
              {t('settings.themeSettingsSection.activeTheme.loading')}
            </LoadingMessage>
          ) : activeTheme ? (
            <>
              <p className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">
                {activeTheme.theme_name}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {activeTheme.theme_description ?? t('settings.themeSettingsSection.activeTheme.noDescription')}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-xs text-[var(--color-text-secondary)]">
                <div>
                  <dt className="font-semibold text-[var(--color-text-primary)]">
                    {t('settings.themeSettingsSection.activeTheme.stats.themeId')}
                  </dt>
                  <dd>{activeTheme.id}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--color-text-primary)]">
                    {t('settings.themeSettingsSection.activeTheme.stats.version')}
                  </dt>
                  <dd>{activeTheme.version}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--color-text-primary)]">
                    {t('settings.themeSettingsSection.activeTheme.stats.installs')}
                  </dt>
                  <dd>{formatNumber(activeTheme.install_count ?? 0)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--color-text-primary)]">
                    {t('settings.themeSettingsSection.activeTheme.stats.rating')}
                  </dt>
                  <dd>
                    {typeof activeTheme.average_rating === 'number'
                      ? formatNumber(activeTheme.average_rating, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })
                      : t('settings.themeSettingsSection.activeTheme.stats.ratingFallback')}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <EmptyState
              illustration="noData"
              title={t('settings.themeSettingsSection.activeTheme.noActive')}
              className="mt-2 py-6"
            />
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
          <ThemeSelector onCreateNewTheme={onCreateTheme} />
          <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-secondary)]">
            <p className="font-semibold text-[var(--color-text-primary)]">
              {t('settings.themeSettingsSection.reminder.title')}
            </p>
            <p className="mt-1">
              {t('settings.themeSettingsSection.reminder.body')}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t('settings.themeSettingsSection.advancedMode.title')}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {t('settings.themeSettingsSection.advancedMode.description')}
            </p>
          </div>
          <label className="inline-flex items-center gap-3">
            <span className="text-sm text-[var(--color-text-secondary)]">
              {advancedModeEnabled
                ? t('settings.themeSettingsSection.advancedMode.statusEnabled')
                : t('settings.themeSettingsSection.advancedMode.statusDisabled')}
            </span>
            <button
              type="button"
              className={`relative inline-flex h-6 w-12 items-center rounded-full transition ${
                advancedModeEnabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
              } ${advancedModePending ? 'opacity-50' : ''}`}
              onClick={() => handleAdvancedModeToggle(!advancedModeEnabled)}
              disabled={advancedModePending}
              aria-pressed={advancedModeEnabled}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                  advancedModeEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
        {advancedModeError && (
          <p className="mt-2 text-xs text-red-500" role="alert">
            {advancedModeError}
          </p>
        )}
        {userSettings?.updated_at && (
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            {t('settings.themeSettingsSection.advancedMode.lastSynced', {
              formattedDate: formatDate(userSettings.updated_at, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
        )}
      </div>
    </section>
  );
};

export default ThemeSettingsSection;
