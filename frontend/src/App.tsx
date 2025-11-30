import { useState } from 'react';
import ThemeSelector from './components/themes/ThemeSelector';
import ThemeGallery from './components/themes/ThemeGallery';
import ThemeEditor from './components/themes/ThemeEditor';
import { useTheme } from './hooks/useTheme';
import type { UserTheme } from './types/theme';
import './App.css';

function App() {
  const { activeTheme, isLoading, cssVariables } = useTheme();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<UserTheme | null>(null);

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

  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-10 text-[var(--color-text-primary)]">
      <main className="mx-auto flex max-w-5xl flex-col gap-8">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-md">
          <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-[var(--color-text-secondary)]">
                Theme System
              </p>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {activeTheme ? activeTheme.theme_name : 'No theme selected'}
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {activeTheme?.theme_description ??
                  'Choose a theme to see the UI update in real-time.'}
              </p>
            </div>
            <ThemeSelector onCreateNewTheme={handleOpenCreate} />
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Primary Palette
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
                Typography Preview
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  { label: 'Heading', className: 'text-xl font-semibold' },
                  { label: 'Body', className: 'text-base' },
                  { label: 'Caption', className: 'text-sm text-[var(--color-text-secondary)]' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                      {item.label}
                    </p>
                    <p className={item.className}>
                      The quick brown fox jumps over the lazy dog.
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <ThemeGallery onCreateNewTheme={handleOpenCreate} onEditTheme={handleEditTheme} />

        <section className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <p className="text-sm uppercase tracking-wide text-[var(--color-text-secondary)]">
            Debug Info
          </p>
          {isLoading ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Loading theme data…
            </p>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-[var(--color-text-secondary)]">
              <p>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  Active Theme ID:
                </span>{' '}
                {activeTheme?.id ?? 'n/a'}
              </p>
              <p>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  CSS Variables Loaded:
                </span>{' '}
                {Object.keys(cssVariables).length}
              </p>
            </div>
          )}
        </section>
      </main>
      {isEditorOpen && (
        <ThemeEditor
          isOpen={isEditorOpen}
          onClose={handleCloseEditor}
          initialTheme={editingTheme}
        />
      )}
    </div>
  );
}

export default App;
