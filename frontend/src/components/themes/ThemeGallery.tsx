import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import ThemePreviewCard from './ThemePreviewCard';
import { useTheme } from '../../hooks/useTheme';
import type { UserTheme } from '../../types/theme';
import { EmptyState } from '../empty';
import LoadingSpinner from '../ui/LoadingSpinner';

const filterOptions = [
  { labelKey: 'themes.gallery.filters.all', value: 'all' },
  { labelKey: 'themes.gallery.filters.predefined', value: 'predefined' },
  { labelKey: 'themes.gallery.filters.custom', value: 'custom' },
];

const sortOptions = [
  { labelKey: 'themes.gallery.sort.name', value: 'name' },
  { labelKey: 'themes.gallery.sort.newest', value: 'newest' },
  { labelKey: 'themes.gallery.sort.popular', value: 'popular' },
];

type FilterValue = (typeof filterOptions)[number]['value'];
type SortValue = (typeof sortOptions)[number]['value'];

interface ThemeGalleryProps {
  onCreateNewTheme?: () => void;
  onEditTheme?: (theme: UserTheme) => void;
}

const ThemeGallery = ({ onCreateNewTheme, onEditTheme }: ThemeGalleryProps) => {
  const { t } = useTranslation();
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
            {t('themes.gallery.header.kicker')}
          </p>
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t('themes.gallery.header.title')}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('themes.gallery.header.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
            onClick={refreshThemes}
            disabled={isLoading}
          >
            {t('themes.gallery.actions.refresh')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
            onClick={handleCreateTheme}
          >
            {t('themes.gallery.actions.createTheme')}
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
              {t(option.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            placeholder={t('themes.gallery.search.placeholder')}
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
                {t(option.labelKey)}
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
        <div className="mt-8">
          <LoadingSpinner size="lg" message={t('themes.gallery.status.loading')} />
        </div>
      ) : filteredThemes.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Search}
            illustration={customThemes.length === 0 && filter === 'custom' ? 'noData' : 'noResults'}
            title={
              customThemes.length === 0 && filter === 'custom'
                ? t('themes.gallery.empty.noCustomTitle')
                : t('themes.gallery.empty.noResultsTitle')
            }
            description={
              customThemes.length === 0 && filter === 'custom'
                ? t('themes.gallery.empty.noCustomDescription')
                : t('themes.gallery.empty.noResultsDescription')
            }
            action={
              customThemes.length === 0 && filter === 'custom'
                ? { label: t('themes.gallery.empty.createFirstAction'), onClick: handleCreateTheme }
                : undefined
            }
          />
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
