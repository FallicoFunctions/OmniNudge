import { resolveMediaUrl } from '../../utils/mediaUrl';

interface UserAvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7 w-7 text-xs font-bold',
  md: 'h-9 w-9 text-sm font-semibold',
  lg: 'h-16 w-16 text-xl font-semibold',
};

// Renders a user's avatar image, or a fallback tile with their initial when no
// avatar is set. Used anywhere a small inline avatar is needed (wall posts,
// mutual friends lists, etc).
export function UserAvatar({ username, avatarUrl, size = 'md', className = '' }: UserAvatarProps) {
  const sizeClasses = SIZE_CLASSES[size];

  if (avatarUrl) {
    return (
      <img
        src={resolveMediaUrl(avatarUrl)}
        alt={username}
        className={`${sizeClasses} flex-shrink-0 rounded-lg object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} flex flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-border)] text-[var(--color-text-secondary)] ${className}`}
    >
      {username.charAt(0).toUpperCase()}
    </div>
  );
}
