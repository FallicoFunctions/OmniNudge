import type { CSSProperties } from 'react';

interface GroupAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

/** Deterministic color from group name */
function nameToColor(name: string): string {
  const colors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#6366f1',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return colors[hash % colors.length];
}

/** Get initials (up to 2 chars) from group name */
function nameToInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function GroupAvatar({ name, avatarUrl, size = 40, className = '' }: GroupAvatarProps) {
  const style: CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0 };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={style}
        className={`object-cover ${className}`}
      />
    );
  }

  const bg = nameToColor(name);
  const initials = nameToInitials(name);
  const fontSize = Math.round(size * 0.38);

  return (
    <div
      style={{ ...style, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className={`font-semibold text-white select-none ${className}`}
      aria-label={name}
    >
      <span style={{ fontSize }}>{initials}</span>
    </div>
  );
}
