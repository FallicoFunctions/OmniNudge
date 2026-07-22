import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ChevronRight } from 'lucide-react';
import PersonaAvatar from './PersonaAvatar';
import type { BotPersona } from '../../types/omnichat';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  personas: BotPersona[];
  onSelectPersona: (persona: BotPersona, trigger?: HTMLElement) => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

export default function SearchOverlay({
  isOpen,
  onClose,
  personas,
  onSelectPersona,
  restoreFocusRef,
}: SearchOverlayProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus({
    isActive: isOpen,
    onEscape: onClose,
    initialFocusRef: inputRef,
    restoreFocusRef,
  });

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    setQuery('');
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();

    const scored = personas
      .map((p) => {
        const nameIdx = p.name.toLowerCase().indexOf(q);
        const descIdx = p.description?.toLowerCase().indexOf(q) ?? -1;
        const nameMatch = nameIdx >= 0;
        const descMatch = descIdx >= 0;
        if (!nameMatch && !descMatch) return null;
        // Lower score = higher priority: name matches beat description matches,
        // earlier match position beats later
        const score = nameMatch ? nameIdx * 2 : 1000 + descIdx;
        return { persona: p, score, nameMatch };
      })
      .filter(Boolean) as Array<{ persona: BotPersona; score: number; nameMatch: boolean }>;

    return scored.sort((a, b) => a.score - b.score).map((s) => s.persona);
  }, [personas, query]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      data-omnichat-search-overlay="true"
      role="dialog"
      aria-modal="true"
      aria-label={t('omnichat.sidebar.search')}
      className="fixed inset-0 z-50 flex flex-col pb-[var(--omnichat-safe-bottom)] pt-[var(--omnichat-safe-top)]"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Search bar — top 25% of viewport */}
      <div className="relative flex-[1] flex items-end px-4 pb-3">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('omnichat.sidebar.searchPlaceholder')}
              className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 pl-11 pr-12 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('omnichat.sidebar.clearSearch')}
                className="omnichat-touch-target absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="omnichat-touch-target flex-shrink-0 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-gray-100"
          >
            {t('omnichat.sidebar.closeSearch')}
          </button>
        </div>
      </div>

      {/* Results — fill the bottom 75% of viewport */}
      <div className="relative flex-[3] overscroll-y-contain overflow-y-auto px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          {query.trim() && results.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
              {t('omnichat.sidebar.noResults')}
            </p>
          )}
          {query.trim() && results.length > 0 && (
            <div className="space-y-2">
              {results.map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={(event) => {
                    onClose();
                    onSelectPersona(persona, event.currentTarget);
                  }}
                  className="flex w-full items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-elevated)] active:translate-y-0 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2"
                >
                  <PersonaAvatar
                    persona={persona}
                    className="h-12 w-12 flex-shrink-0 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                      {persona.name}
                    </p>
                    {persona.description && (
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">
                        {persona.description}
                      </p>
                    )}
                  </div>
                  {persona.is_nsfw && (
                    <span className="flex-shrink-0 rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                      18+
                    </span>
                  )}
                  <ChevronRight
                    size={16}
                    className="flex-shrink-0 text-[var(--color-text-muted)]"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
