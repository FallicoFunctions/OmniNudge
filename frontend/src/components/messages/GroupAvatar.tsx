import type { CSSProperties } from 'react';

interface GroupAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

// CSS variable names for avatar colors — defined in the design system.
// Using data-color index + CSS variables keeps colors theme-aware (dark mode works).
const AVATAR_COLOR_VARS = [
  'var(--color-primary)',
  'var(--color-purple, #8b5cf6)',
  'var(--color-pink, #ec4899)',
  'var(--color-error)',
  'var(--color-orange, #f97316)',
  'var(--color-yellow, #eab308)',
  'var(--color-success)',
  'var(--color-teal, #14b8a6)',
  'var(--color-cyan, #06b6d4)',
  'var(--color-indigo, #6366f1)',
] as const;

/** Deterministic color index from group name — stable across renders */
function nameToColorVar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLOR_VARS[hash % AVATAR_COLOR_VARS.length];
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
        alt={`${name} group avatar`}
        style={style}
        className={`object-cover ${className}`}
      />
    );
  }

  const bg = nameToColorVar(name);
  const initials = nameToInitials(name);
  const fontSize = Math.round(size * 0.38);

  return (
    <div
      style={{ ...style, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className={`font-semibold text-white select-none ${className}`}
      aria-label={`${name} group avatar`}
      role="img"
    >
      <span style={{ fontSize }}>{initials}</span>
    </div>
  );
}
