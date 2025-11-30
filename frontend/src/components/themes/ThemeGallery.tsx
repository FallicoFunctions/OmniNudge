import { useMemo, useState } from 'react';
import ThemePreviewCard from './ThemePreviewCard';
import { useTheme } from '../../hooks/useTheme';
import type { UserTheme } from '../../types/theme';

const filterOptions = [
  { label: 'All', value: 'all' },
  { label: 'Predefined', value: 'predefined' },
  { label: 'My Themes', value: 'custom' },
];

const sortOptions = [
  { label: 'Name (A-Z)', value: 'name' },
  { label: 'Newest', value: 'newest' },
  { label: 'Most Popular', value: 'popular' },
];

type FilterValue = (typeof filterOptions)[number]['value'];
type SortValue = (typeof sortOptions)[number]['value'];

interface ThemeGalleryProps {
  onCreateNewTheme?: () => void;
  onEditTheme?: (theme: UserTheme) => void;
}

const ThemeGallery = ({ onCreateNewTheme, onEditTheme }: ThemeGalleryProps) => {
  const {
    predefinedThemes,
    customThemes,
    isLoading,
    error,
    activeTheme,
    selectTheme,
    refreshThemes,
  } = useTheme();

  const [filter, setFilter] = useState<FilterValue>('all');
  const [sort, setSort] = useState<SortValue>('name');
  const [searchQuery, setSearchQuery] = useState('');

  const combinedThemes = useMemo(() => {
    switch (filter) {
      case 'predefined':
        return predefinedThemes;
      case 'custom':
        return customThemes;
      default:
        return [...predefinedThemes, ...customThemes];
    }
  }, [filter, predefinedThemes, customThemes]);

  const filteredThemes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let themes = combinedThemes;

    if (query) {
      themes = themes.filter(
        (theme) =>
          theme.theme_name.toLowerCase().includes(query) ||
          theme.theme_description?.toLowerCase().includes(query)
      );
    }

    const sortedThemes = [...themes];
    switch (sort) {
      case 'newest':
        sortedThemes.sort(
          (a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '')
        );
        break;
      case 'popular':
        sortedThemes.sort((a, b) => (b.install_count ?? 0) - (a.install_count ?? 0));
        break;
      default:
        sortedThemes.sort((a, b) => a.theme_name.localeCompare(b.theme_name));
    }

    return sortedThemes;
  }, [combinedThemes, searchQuery, sort]);

  const handleSelectTheme = async (theme: UserTheme) => {
    await selectTheme(theme);
  };

  const handleCreateTheme = () => {
    if (onCreateNewTheme) {
      onCreateNewTheme();
    } else {
      console.info('Create theme wizard coming soon');
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-md">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-[var(--color-text-secondary)]">
            Theme Gallery
          </p>
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Browse Themes</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Choose from predefined or custom themes, search, and sort to find the perfect match.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
            onClick={refreshThemes}
            disabled={isLoading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
            onClick={handleCreateTheme}
          >
            + Create Theme
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-full px-4 py-1 text-sm font-semibold ${
                filter === option.value
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
              }`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            placeholder="Search themes…"
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortValue)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="mt-6 text-sm text-[var(--color-text-secondary)]">Loading themes…</p>
      ) : filteredThemes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]">
          No themes match your filters. Try adjusting your search or create a new theme.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {filteredThemes.map((theme) => (
            <ThemePreviewCard
              key={theme.id}
              theme={theme}
              isActive={activeTheme?.id === theme.id}
              onSelect={handleSelectTheme}
              onEdit={filter === 'custom' || customThemes.some((item) => item.id === theme.id) ? onEditTheme : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default ThemeGallery;
