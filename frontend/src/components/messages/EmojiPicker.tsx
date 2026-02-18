import { useEffect, useMemo, useRef, useState } from 'react';

const EMOJI_OPTIONS = [
  '👍', '❤️', '😂', '😮', '😢', '🔥',
  '👏', '🎉', '🙏', '💯', '😎', '🤔',
  '👀', '✅', '❌', '🚀', '💡', '🤝',
  '🙌', '🥳', '😅', '😍', '😭', '⚡',
] as const;

const GRID_COLUMNS = 6;

interface EmojiPickerProps {
  isOpen: boolean;
  isOwnMessage: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ isOpen, isOwnMessage, onSelect, onClose }: EmojiPickerProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const emojis = useMemo(() => [...EMOJI_OPTIONS], []);

  useEffect(() => {
    if (!isOpen) return;
    setFocusedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const target = buttonsRef.current[focusedIndex];
    target?.focus();
  }, [focusedIndex, isOpen]);

  if (!isOpen) return null;

  const selectEmoji = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  const moveFocus = (nextIndex: number) => {
    const total = emojis.length;
    if (nextIndex < 0) {
      setFocusedIndex(total - 1);
      return;
    }
    if (nextIndex >= total) {
      setFocusedIndex(0);
      return;
    }
    setFocusedIndex(nextIndex);
  };

  return (
    <>
      <div className="fixed inset-0 z-20" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Emoji picker"
        className={[
          'fixed inset-0 z-30 flex flex-col bg-[var(--color-surface)] p-4 sm:inset-auto sm:bottom-full sm:mb-1 sm:w-[320px] sm:rounded-xl sm:border sm:border-[var(--color-border)] sm:bg-[var(--color-surface)] sm:p-2 sm:shadow-lg',
          isOwnMessage ? 'sm:right-0' : 'sm:left-0',
        ].join(' ')}
      >
        <div className="mb-3 flex items-center justify-between sm:mb-2">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Choose reaction
          </span>
          <button
            type="button"
            aria-label="Close emoji picker"
            className="rounded-md px-2 py-1 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div
          role="grid"
          aria-label="Emoji choices"
          className="grid grid-cols-6 gap-2 overflow-y-auto pb-3 sm:pb-0"
        >
          {emojis.map((emoji, index) => (
            <button
              key={emoji}
              ref={(el) => {
                buttonsRef.current[index] = el;
              }}
              type="button"
              aria-label={`React with ${emoji}`}
              className="rounded-lg p-2 text-2xl transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              onClick={() => selectEmoji(emoji)}
              onFocus={() => setFocusedIndex(index)}
              onKeyDown={(e) => {
                switch (e.key) {
                  case 'ArrowRight':
                    e.preventDefault();
                    moveFocus(index + 1);
                    break;
                  case 'ArrowLeft':
                    e.preventDefault();
                    moveFocus(index - 1);
                    break;
                  case 'ArrowDown':
                    e.preventDefault();
                    moveFocus(index + GRID_COLUMNS);
                    break;
                  case 'ArrowUp':
                    e.preventDefault();
                    moveFocus(index - GRID_COLUMNS);
                    break;
                  case 'Enter':
                  case ' ':
                    e.preventDefault();
                    selectEmoji(emoji);
                    break;
                  case 'Escape':
                    e.preventDefault();
                    onClose();
                    break;
                  default:
                    break;
                }
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
