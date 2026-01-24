import type { RefObject } from 'react';
import { LoadingMessage, ErrorMessage, EmptyMessage } from '../common/StatusMessage';

export interface AboutPanelStat {
  label: string;
  value: string | number | null | undefined;
  format?: (value: string | number) => string;
}

interface AboutPanelProps {
  title: string;
  isLoading: boolean;
  isError: boolean;
  icon?: string | null;
  description?: string | null;
  htmlDescription?: string | null;
  htmlRef?: RefObject<HTMLDivElement | null>;
  stats?: AboutPanelStat[];
  emptyMessage?: string;
  errorMessage?: string;
}

export const AboutPanel: React.FC<AboutPanelProps> = ({
  title,
  isLoading,
  isError,
  icon,
  description,
  htmlDescription,
  htmlRef,
  stats,
  emptyMessage = 'No details available.',
  errorMessage = 'Unable to load details.',
}) => {
  const formatStatValue = (stat: AboutPanelStat): string => {
    if (stat.value === null || stat.value === undefined) {
      return '—';
    }
    if (stat.format) {
      return stat.format(stat.value);
    }
    if (typeof stat.value === 'number') {
      return stat.value.toLocaleString();
    }
    return String(stat.value);
  };

  const hasContent = description || htmlDescription || (stats && stats.length > 0);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {title}
      </h3>
      {isLoading ? (
        <LoadingMessage>Loading details…</LoadingMessage>
      ) : isError ? (
        <ErrorMessage>{errorMessage}</ErrorMessage>
      ) : hasContent ? (
        <>
          {icon && (
            <img
              src={icon}
              alt=""
              className="mt-3 h-12 w-12 rounded-full object-cover"
              loading="lazy"
            />
          )}
          {htmlDescription ? (
            <div
              ref={htmlRef}
              className="reddit-sidebar-content mt-3"
              dangerouslySetInnerHTML={{ __html: htmlDescription }}
            />
          ) : description ? (
            <p className="mt-2 text-sm text-[var(--color-text-primary)] whitespace-pre-line">
              {description}
            </p>
          ) : null}
          {stats && stats.length > 0 && (
            <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
              {stats.map((stat, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--color-text-primary)]">{stat.label}</span>
                  <span>{formatStatValue(stat)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <EmptyMessage>{emptyMessage}</EmptyMessage>
      )}
    </div>
  );
};
