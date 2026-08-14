import { useTranslation } from 'react-i18next';

export type ContentType = 'posts' | 'comments' | 'both';
export type SourceFilter = 'omni' | 'reddit' | 'both';

type SavedItemFiltersProps = {
  contentType?: ContentType;
  sourceFilter: SourceFilter;
  onContentTypeChange?: (next: ContentType) => void;
  onSourceFilterChange: (next: SourceFilter) => void;
  disabledContentTypes?: ContentType[];
  showContentTypeFilter?: boolean;
};

const sharedButtonClass = 'flex-1 rounded-md px-4 py-2 text-sm font-semibold transition';

const getFilterButtonClass = (isActive: boolean, isDisabled: boolean) =>
  `${sharedButtonClass} ${
    isActive
      ? 'bg-[var(--color-primary)] text-white border-2 border-[var(--color-primary)] shadow'
      : isDisabled
        ? 'border-2 border-[var(--color-border)] text-[var(--color-text-muted)] opacity-60 cursor-not-allowed'
        : 'border-2 border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
  }`;

export function SavedItemFilters({
  contentType,
  sourceFilter,
  onContentTypeChange,
  onSourceFilterChange,
  disabledContentTypes = [],
  showContentTypeFilter = true,
}: SavedItemFiltersProps) {
  const { t } = useTranslation();

  const contentOptions: ContentType[] = ['posts', 'comments', 'both'];
  const sourceOptions: SourceFilter[] = ['omni', 'reddit', 'both'];

  return (
    <div className="mb-6 space-y-4">
      {showContentTypeFilter && contentType && onContentTypeChange && (
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
            {t('saved.filters.show')}
          </label>
          <div className="inline-flex gap-2 rounded-lg bg-[var(--color-surface-elevated)] p-1">
            {contentOptions.map((option) => {
              const isDisabled = disabledContentTypes.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={isDisabled}
                  className={getFilterButtonClass(contentType === option, isDisabled)}
                  onClick={() => onContentTypeChange(option)}
                >
                  {t(`saved.filters.${option}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
          {t('saved.filters.source')}
        </label>
        <div className="inline-flex gap-2 rounded-lg bg-[var(--color-surface-elevated)] p-1">
          {sourceOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={getFilterButtonClass(sourceFilter === option, false)}
              onClick={() => onSourceFilterChange(option)}
            >
              {t(`saved.filters.${option}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
