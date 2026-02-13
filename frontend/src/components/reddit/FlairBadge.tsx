import { decodeHtmlEntities } from '../../utils/text';
import { useTranslation } from 'react-i18next';

interface FlairBadgeProps {
  text?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  className?: string;
}

const resolveBackground = (value?: string | null) => {
  if (!value || value === 'transparent') {
    return 'var(--color-surface-elevated)';
  }
  return value;
};

const resolveTextColor = (value?: string | null) => {
  if (!value) {
    return '#fff';
  }
  const normalized = value.toLowerCase();
  if (normalized === 'dark') {
    return 'var(--color-text-primary)';
  }
  if (normalized === 'light') {
    return '#fff';
  }
  return value;
};

export function FlairBadge({ text, backgroundColor, textColor, className = '' }: FlairBadgeProps) {
  const { t } = useTranslation();
  const trimmed = decodeHtmlEntities(text)?.trim();
  if (!trimmed) {
    return null;
  }

  const bg = resolveBackground(backgroundColor);
  const fg = resolveTextColor(textColor);

  return (
    <span
      className={`inline-flex items-center rounded px-1 py-0.5 text-xs font-medium ${className}`}
      style={{
        backgroundColor: bg,
        color: fg,
        borderColor: bg === 'var(--color-surface-elevated)' ? 'var(--color-border)' : bg,
        opacity: 0.9,
      }}
      title={t('posts.flairBadge.title', { flair: trimmed })}
    >
      {trimmed}
    </span>
  );
}
