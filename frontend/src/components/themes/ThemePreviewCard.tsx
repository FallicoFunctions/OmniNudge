import type { UserTheme } from '../../types/theme';
import { getThemeVariable } from '../../utils/theme';

interface ThemePreviewCardProps {
  theme: UserTheme;
  isActive?: boolean;
  onSelect?: (theme: UserTheme) => void;
  onEdit?: (theme: UserTheme) => void;
}

const ThemePreviewCard = ({ theme, isActive, onSelect, onEdit }: ThemePreviewCardProps) => {
  const installs = theme.install_count ?? 0;
  const rating = theme.average_rating ?? 0;

  const palette = [
    { label: 'Primary', value: getThemeVariable(theme, '--color-primary', '#3b82f6') },
    { label: 'Surface', value: getThemeVariable(theme, '--color-surface', '#ffffff') },
    { label: 'Background', value: getThemeVariable(theme, '--color-background', '#f3f4f6') },
    { label: 'Accent', value: getThemeVariable(theme, '--color-success', '#10b981') },
  ];

  const previewStyles = {
    background: getThemeVariable(theme, '--color-background', '#f5f5f5'),
    surface: getThemeVariable(theme, '--color-surface', '#ffffff'),
    textPrimary: getThemeVariable(theme, '--color-text-primary', '#111827'),
    textSecondary: getThemeVariable(theme, '--color-text-secondary', '#6b7280'),
    primary: getThemeVariable(theme, '--color-primary', '#3b82f6'),
    border: getThemeVariable(theme, '--color-border', '#e5e7eb'),
  };

  return (
    <article
      className={`flex flex-col rounded-2xl border p-4 shadow-sm transition ${
        isActive
          ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)] ring-offset-0'
          : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
      }`}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {theme.theme_name}
          </h3>
          {theme.theme_description && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {theme.theme_description}
            </p>
          )}
        </div>
        {isActive && (
          <span className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
            Active
          </span>
        )}
      </header>

      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div
          className="rounded-lg p-3"
          style={{
            backgroundColor: previewStyles.background,
          }}
        >
          <div
            className="rounded-lg border p-3"
            style={{
              backgroundColor: previewStyles.surface,
              borderColor: previewStyles.border,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: previewStyles.textPrimary }}
                >
                  Header
                </p>
                <p className="text-xs" style={{ color: previewStyles.textSecondary }}>
                  Navigation · Profile
                </p>
              </div>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: previewStyles.primary,
                  color: '#fff',
                }}
              >
                CTA
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {[1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="rounded-md border px-3 py-2"
                  style={{ borderColor: previewStyles.border }}
                >
                  <div
                    className="text-sm font-medium"
                    style={{ color: previewStyles.textPrimary }}
                  >
                    Content block {index}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: previewStyles.textSecondary }}>
                    Secondary text preview
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {palette.map((swatch) => (
          <div key={swatch.label} className="flex flex-col items-center gap-1 text-center">
            <span
              className="h-8 w-8 rounded-full border border-[var(--color-border)]"
              style={{ backgroundColor: swatch.value }}
            />
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              {swatch.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-secondary)]">
        <span>⭐ {rating.toFixed(1)}</span>
        <span>{installs.toLocaleString()} installs</span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => onSelect?.(theme)}
          disabled={isActive}
        >
          {isActive ? 'Selected' : 'Use Theme'}
        </button>
        {onEdit && (
          <button
            type="button"
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
            onClick={() => onEdit(theme)}
          >
            Edit
          </button>
        )}
      </div>
    </article>
  );
};

export default ThemePreviewCard;
