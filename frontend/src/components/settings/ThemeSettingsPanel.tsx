import { useState } from 'react';
import ThemeSelector from '../themes/ThemeSelector';
import ThemeEditor from '../themes/ThemeEditor';
import ThemeGallery from '../themes/ThemeGallery';
import ThemeOnboarding, { resetThemeOnboarding } from '../themes/ThemeOnboarding';
import { useTheme } from '../../hooks/useTheme';
import type { UserTheme } from '../../types/theme';

type ViewMode = 'selector' | 'gallery' | 'editor';

const ThemeSettingsPanel = () => {
  const { activeTheme, userSettings, setAdvancedMode } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('selector');
  const [editingTheme, setEditingTheme] = useState<UserTheme | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleCreateNewTheme = () => {
    setEditingTheme(null);
    setViewMode('editor');
  };

  const handleEditTheme = (theme: UserTheme) => {
    setEditingTheme(theme);
    setViewMode('editor');
  };

  const handleEditorClose = () => {
    setEditingTheme(null);
    setViewMode('selector');
  };

  const handleToggleAdvancedMode = async () => {
    try {
      await setAdvancedMode(!userSettings?.advanced_mode_enabled);
    } catch (err) {
      console.error('Failed to toggle advanced mode', err);
    }
  };

  const handleShowOnboarding = () => {
    resetThemeOnboarding();
    setShowOnboarding(true);
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
              Theme Customization
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Personalize your OmniNudge experience with custom themes
            </p>
          </div>

          <button
            type="button"
            className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition"
            onClick={handleShowOnboarding}
          >
            Show Tour
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {/* Current Theme Display */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
              Active Theme
            </label>
            <p className="mt-1 text-base font-semibold text-[var(--color-primary)]">
              {activeTheme?.theme_name ?? 'No theme selected'}
            </p>
            {activeTheme?.theme_description && (
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {activeTheme.theme_description}
              </p>
            )}
          </div>

          {/* Advanced Mode Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Advanced Mode
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Enable full CSS customization and advanced features
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={userSettings?.advanced_mode_enabled ?? false}
              className={`relative h-6 w-11 rounded-full transition ${
                userSettings?.advanced_mode_enabled
                  ? 'bg-[var(--color-primary)]'
                  : 'bg-[var(--color-border)]'
              }`}
              onClick={handleToggleAdvancedMode}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  userSettings?.advanced_mode_enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                viewMode === 'selector'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] bg-opacity-10 text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]'
              }`}
              onClick={() => setViewMode('selector')}
            >
              Theme Selector
            </button>
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                viewMode === 'gallery'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] bg-opacity-10 text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]'
              }`}
              onClick={() => setViewMode('gallery')}
            >
              Browse Gallery
            </button>
            <button
              type="button"
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
              onClick={handleCreateNewTheme}
            >
              + Create Theme
            </button>
          </div>
        </div>
      </div>

      {/* View Mode Content */}
      {viewMode === 'selector' && (
        <ThemeSelector onCreateNewTheme={handleCreateNewTheme} />
      )}

      {viewMode === 'gallery' && (
        <ThemeGallery
          onCreateNewTheme={handleCreateNewTheme}
          onEditTheme={handleEditTheme}
        />
      )}

      {viewMode === 'editor' && (
        <ThemeEditor
          isOpen={true}
          initialTheme={editingTheme}
          onClose={handleEditorClose}
        />
      )}

      {/* Onboarding */}
      {showOnboarding && (
        <ThemeOnboarding onComplete={() => setShowOnboarding(false)} />
      )}
    </section>
  );
};

export default ThemeSettingsPanel;
