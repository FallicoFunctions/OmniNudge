import type { ReactNode } from 'react';

interface PostHeaderProps {
  title: ReactNode;
  titleBadges?: ReactNode;
  metadataItems: ReactNode[];
}

export function PostHeader({ title, titleBadges, metadataItems }: PostHeaderProps) {
  return (
    <div className="mb-4 text-left">
      <div className="flex flex-wrap items-start gap-2">
        <h1 className="flex-1 text-left text-2xl font-bold text-[var(--color-text-primary)]">
          {title}
        </h1>
        {titleBadges}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        {metadataItems.map((item, index) => (
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <span>•</span>}
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
