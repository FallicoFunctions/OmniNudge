import { Suspense, lazy, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThemeSelector from '../components/themes/ThemeSelector';
import ThemePreview from '../components/themes/ThemePreview';
import ThemeSettingsSection from '../components/settings/ThemeSettingsSection';
import { useTheme } from '../hooks/useTheme';
import { useFormat } from '../hooks/useFormat';
import type { UserTheme } from '../types/theme';
import { LoadingMessage } from '../components/common/StatusMessage';

const ThemeGallery = lazy(() => import('../components/themes/ThemeGallery'));
const ThemeEditor = lazy(() => import('../components/themes/ThemeEditor'));

export default function ThemesPage() {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const { activeTheme, isLoading, cssVariables } = useTheme();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<UserTheme | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const handleOpenCreate = () => {
    setEditingTheme(null);
    setIsEditorOpen(true);
  };

  const handleEditTheme = (theme: UserTheme) => {
    setEditingTheme(theme);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingTheme(null);
  };

  const handleManageThemes = () => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-10 text-[var(--color-text-primary)]">
      <main className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="sr-only" aria-live="polite">
          {activeTheme
            ? t('themesPage.liveRegion.activeTheme', { theme: activeTheme.theme_name })
            : t('themesPage.liveRegion.noActiveTheme')}
        </div>
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-md">
          <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-[var(--color-text-secondary)]">
                {t('themesPage.hero.kicker')}
              </p>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {activeTheme ? activeTheme.theme_name : t('themesPage.hero.noThemeSelected')}
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {activeTheme?.theme_description ??
                  t('themesPage.hero.descriptionFallback')}
              </p>
            </div>
            <ThemeSelector onCreateNewTheme={handleOpenCreate} />
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {t('themesPage.palette.title')}
              </p>
              <div className="mt-3 flex gap-3">
                {['--color-primary', '--color-primary-dark', '--color-primary-light', '--color-success'].map(
                  (variable) => (
                    <div key={variable} className="flex flex-col items-center gap-1">
                      <span
                        className="h-12 w-12 rounded-full border border-[var(--color-border)]"
                        style={{ backgroundColor: `var(${variable})` }}
                      />
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {variable.replace('--color-', '')}
                      </span>
                    </div>
                  )
                )}
              </div>
            </article>

            <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {t('themesPage.typography.title')}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  { label: t('themesPage.typography.labels.heading'), className: 'text-xl font-semibold' },
                  { label: t('themesPage.typography.labels.body'), className: 'text-base' },
                  { label: t('themesPage.typography.labels.caption'), className: 'text-sm text-[var(--color-text-secondary)]' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                      {item.label}
                    </p>
                    <p className={item.className}>
                      {t('themesPage.typography.sampleText')}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <ThemeSettingsSection onCreateTheme={handleOpenCreate} onManageThemes={handleManageThemes} />

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-md">
          <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-[var(--color-text-secondary)]">
                {t('themesPage.livePreview.kicker')}
              </p>
              <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {t('themesPage.livePreview.title')}
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('themesPage.livePreview.subtitle')}
              </p>
            </div>
          </header>
          <ThemePreview variables={cssVariables} />
        </section>

        <div ref={galleryRef}>
          <Suspense
            fallback={
              <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                <LoadingMessage className="mt-0 text-sm">
                  {t('themesPage.gallery.loading')}
                </LoadingMessage>
              </section>
            }
          >
            <ThemeGallery onCreateNewTheme={handleOpenCreate} onEditTheme={handleEditTheme} />
          </Suspense>
        </div>

        <section className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <p className="text-sm uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('themesPage.debug.kicker')}
          </p>
          {isLoading ? (
            <LoadingMessage className="mt-2 text-sm">
              {t('themesPage.debug.loading')}
            </LoadingMessage>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-[var(--color-text-secondary)]">
              <p>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {t('themesPage.debug.activeThemeId')}
                </span>{' '}
                {activeTheme?.id ?? t('themesPage.debug.na')}
              </p>
              <p>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {t('themesPage.debug.cssVariablesLoaded')}
                </span>{' '}
                {formatNumber(Object.keys(cssVariables).length)}
              </p>
            </div>
          )}
        </section>
      </main>
      {isEditorOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-white">
              <LoadingMessage className="mt-0 text-white">
                {t('themesPage.editor.loading')}
              </LoadingMessage>
            </div>
          }
        >
          <ThemeEditor
            isOpen={isEditorOpen}
            onClose={handleCloseEditor}
            initialTheme={editingTheme}
          />
        </Suspense>
      )}
    </div>
  );
}
