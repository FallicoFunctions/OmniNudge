import type { ReactNode } from 'react';

interface PostHeaderProps {
  title: ReactNode;
  titleBadges?: ReactNode;
  metadataItems: ReactNode[];
}

export function PostHeader({ title, titleBadges, metadataItems }: PostHeaderProps) {
  return (
    <div className="mb-4 max-w-full text-left">
      {/* Title */}
      <h1 className="wrap-break-word text-left text-2xl font-bold text-text-primary">{title}</h1>

      {/* Badges row */}
      {titleBadges && <div className="mt-2 flex flex-wrap items-center gap-2">{titleBadges}</div>}

      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        {metadataItems.map((item, index) => (
          <span key={index} className="flex items-center gap-2 wrap-break-word">
            {index > 0 && <span>•</span>}
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
