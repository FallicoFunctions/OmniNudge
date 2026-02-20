import { useTranslation } from 'react-i18next';
import type { ConversationFolder } from '../../types/messages';

/** Converts a hex color to rgba with given opacity (0–1). Falls back gracefully for non-hex. */
export function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.replace('#', '');
  // Expand 3-char shorthand (#f00 → #ff0000)
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  if (clean.length !== 6) return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns '#000000' or '#ffffff' — whichever has better contrast against the given hex color.
 * Uses relative luminance per WCAG 2.1.
 */
export function getContrastColor(hex: string): string {
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  if (clean.length !== 6) return '#000000';
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

interface FolderBadgeProps {
  folder: ConversationFolder;
  /** Pass true when the folder name is already conveyed by surrounding context */
  decorative?: boolean;
}

export function FolderBadge({ folder, decorative = false }: FolderBadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : t('messages.folders.badgeLabel', { name: folder.name })}
      aria-hidden={decorative ? true : undefined}
      className="inline-flex max-w-[7rem] items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={{
        backgroundColor: hexToRgba(folder.color, 0.12),
        color: folder.color,
      }}
      title={decorative ? undefined : folder.name}
    >
      <span className="inline-flex flex-shrink-0 items-center leading-none" aria-hidden>
        {folder.icon}
      </span>
      <span className="truncate" aria-hidden>
        {folder.name}
      </span>
    </span>
  );
}
