import type { ReactNode } from 'react';

/**
 * One question and its answers.
 *
 * The whole flow is this shape, so the styling lives here once rather than in
 * nine screens. Selected and unselected match the report modal's existing
 * pattern, which is where this vocabulary already exists in the app.
 */
export interface OptionGridProps {
  label: string;
  /** Shown right-aligned beside the label. Empty when the question has no count. */
  counter?: string;
  counterHighlighted?: boolean;
  columns: number;
  options: { key: string; label: string; gloss?: string }[];
  isSelected: (key: string) => boolean;
  onPick: (key: string) => void;
  /** Rendered instead of the grid when there is nothing to offer. */
  empty?: ReactNode;
}

export default function OptionGrid({
  label,
  counter,
  counterHighlighted,
  columns,
  options,
  isSelected,
  onPick,
  empty,
}: OptionGridProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-[620px] items-baseline justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">{label}</p>
        {counter ? (
          <p
            className={`text-xs font-semibold tabular-nums ${
              counterHighlighted ? 'text-[#7da8ff]' : 'text-white/40'
            }`}
          >
            {counter}
          </p>
        ) : null}
      </div>

      {options.length === 0 && empty ? (
        <p className="max-w-[620px] text-sm text-white/40">{empty}</p>
      ) : (
        <div
          className="grid max-w-[620px] gap-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {options.map((option) => {
            const selected = isSelected(option.key);
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(option.key)}
                className={`omnichat-touch-target flex flex-col items-start justify-center gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition ${
                  selected
                    ? 'border-[#5d8fff] bg-[#315ca8]/15 text-white'
                    : 'border-white/10 bg-white/[0.035] text-white/75 hover:border-[#5d8fff]/60 hover:bg-[#315ca8]/10'
                }`}
              >
                <span className="text-sm font-medium">{option.label}</span>
                {option.gloss ? (
                  <span className="text-[11px] leading-[15px] text-white/45">{option.gloss}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
