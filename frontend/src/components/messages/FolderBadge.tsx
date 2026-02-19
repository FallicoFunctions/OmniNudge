import type { ConversationFolder } from '../../types/messages';

interface FolderBadgeProps {
  folder: ConversationFolder;
}

export function FolderBadge({ folder }: FolderBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={{ backgroundColor: folder.color + '22', color: folder.color }}
      title={folder.name}
    >
      <span aria-hidden>{folder.icon}</span>
      <span className="max-w-[80px] truncate">{folder.name}</span>
    </span>
  );
}
