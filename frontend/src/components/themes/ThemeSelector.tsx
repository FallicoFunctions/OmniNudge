import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../hooks/useTheme';
import type { UserTheme } from '../../types/theme';
import { getThemeVariable } from '../../utils/theme';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface ThemeSelectorProps {
  onCreateNewTheme?: () => void;
  variant?: 'card' | 'toolbar';
}

const ThemeSelector = ({ onCreateNewTheme, variant = 'card' }: ThemeSelectorProps) => {
  const {
    activeTheme,
    predefinedThemes,
    customThemes,
    isLoading,
    error,
    selectTheme,
    refreshThemes,
  } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [switchingThemeId, setSwitchingThemeId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const isMobile = useMediaQuery('(max-width: 640px)');

  const themeGroups = useMemo(
    () => [
      { label: 'Predefined Themes', themes: predefinedThemes },
      { label: 'My Themes', themes: customThemes },
    ],
    [predefinedThemes, customThemes]
  );

  const handleSelect = async (theme: UserTheme) => {
    setSwitchingThemeId(theme.id);
    await selectTheme(theme);
    setSwitchingThemeId(null);
    setIsOpen(false);
    setAnnouncement(`Theme ${theme.theme_name} selected`);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshThemes();
    setIsRefreshing(false);
    setAnnouncement('Theme list refreshed');
  };

  const handleCreateTheme = () => {
    if (onCreateNewTheme) {
      onCreateNewTheme();
    } else {
      console.info('Theme creation flow coming soon.');
    }
    setIsOpen(false);
  };

  const menuContent = (
    <div
      className={`${
        isMobile ? 'fixed inset-0 z-40 bg-black/50' : 'absolute z-20 mt-2 w-full'
      }`}
      role="dialog"
      aria-modal={isMobile}
    >
      <div
        className={`${
          isMobile
            ? 'absolute inset-x-0 top-auto bottom-0 rounded-t-3xl'
            : 'w-full'
        } rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl`}
        style={isMobile ? { maxHeight: '85vh' } : undefined}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Theme Options
            </p>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-sm font-medium text-[var(--color-primary)] disabled:opacity-60"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {isMobile && (
              <button
                type="button"
                className="rounded-full bg-[var(--color-surface-elevated)] px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)]"
                onClick={() => setIsOpen(false)}
                aria-label="Close theme selector"
              >
                Close ✕
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--color-text-secondary)]">
            Loading themes…
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto px-2 py-2 sm:max-h-96">
            {themeGroups.map(({ label, themes }) => (
              <div key={label} className="mb-4 last:mb-0">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {label}
                </p>
                {themes.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-[var(--color-text-secondary)]">
                    No themes available.
                  </p>
                ) : (
                  themes.map((theme) => {
                    const isActive = activeTheme?.id === theme.id;
                    const primaryColor = getThemeVariable(theme, '--color-primary', 'var(--color-primary)');
                    const backgroundColor = getThemeVariable(
                      theme,
                      '--color-background',
                      'var(--color-background)'
                    );
                    const surfaceColor = getThemeVariable(
                      theme,
                      '--color-surface',
                      'var(--color-surface)'
                    );

                    const activeStyles = isActive
                      ? { boxShadow: '0 0 0 2px var(--color-primary)' }
                      : undefined;

                    return (
                      <button
                        key={theme.id}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                          isActive
                            ? 'border-[var(--color-primary)]'
                            : 'border-transparent hover:bg-[var(--color-surface-elevated)]'
                        }`}
                        style={activeStyles}
                        onClick={() => handleSelect(theme)}
                        disabled={switchingThemeId === theme.id}
                      >
                        <div className="flex h-10 w-16 items-center justify-center rounded-md border border-[var(--color-border)] bg-white">
                          <div
                            className="h-8 w-6 rounded-md shadow-inner"
                            style={{
                              background: `linear-gradient(135deg, ${backgroundColor}, ${surfaceColor})`,
                              border: `2px solid ${primaryColor}`,
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {theme.theme_name}
                          </p>
                          {theme.theme_description && (
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {theme.theme_description}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {isActive
                            ? 'Active'
                            : switchingThemeId === theme.id
                              ? 'Updating…'
                              : 'Select'}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            className="mt-1 w-full rounded-lg border border-dashed border-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)]"
            onClick={handleCreateTheme}
          >
            + Create New Theme
          </button>
        </div>
      </div>
    </div>
  );

  const menu = isMobile ? createPortal(menuContent, document.body) : menuContent;

  const isToolbarVariant = variant === 'toolbar';

  return (
    <div
      className={`relative inline-block text-left ${isToolbarVariant ? 'min-w-[14rem] self-stretch' : 'w-full max-w-md'}`}
    >
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <button
        type="button"
        className={`flex w-full items-center justify-between text-left transition ${isToolbarVariant ? 'box-border h-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 shadow-none hover:bg-[var(--color-surface-elevated)]' : 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm'}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">Active Theme</p>
          <p className="text-base font-semibold text-[var(--color-text-primary)]">
            {activeTheme?.theme_name ?? 'Select a theme'}
          </p>
        </div>
        <span className="text-lg text-[var(--color-text-muted)]">
          {isOpen ? '▴' : '▾'}
        </span>
      </button>

      {isOpen && menu}
    </div>
  );
};

export default ThemeSelector;
