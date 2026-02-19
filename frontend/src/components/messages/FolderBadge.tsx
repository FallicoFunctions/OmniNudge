import type { ConversationFolder } from '../../types/messages';

/** Converts a hex color to rgba with given opacity (0–1). Falls back gracefully for non-hex. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface FolderBadgeProps {
  folder: ConversationFolder;
}

export function FolderBadge({ folder }: FolderBadgeProps) {
  return (
    <span
      className="inline-flex max-w-[7rem] items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={{
        backgroundColor: hexToRgba(folder.color, 0.13),
        color: folder.color,
      }}
      title={folder.name}
    >
      <span className="inline-flex flex-shrink-0 items-center leading-none" aria-hidden>
        {folder.icon}
      </span>
      <span className="truncate">{folder.name}</span>
    </span>
  );
}
