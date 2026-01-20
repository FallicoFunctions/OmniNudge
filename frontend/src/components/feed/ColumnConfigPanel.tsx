import { useState } from 'react';
import { useMultiColumnFeed } from '../../contexts/MultiColumnFeedContext';
import type { ColumnConfig } from '../../contexts/MultiColumnFeedContext';

interface ColumnConfigPanelProps {
  columnId: string;
  config: ColumnConfig;
}

export function ColumnConfigPanel({ columnId, config }: ColumnConfigPanelProps) {
  const { updateColumnConfig } = useMultiColumnFeed();
  const [isExpanded, setIsExpanded] = useState(false);

  const getFeedLabel = () => {
    switch (config.feedType) {
      case 'home':
        return config.omniOnly ? 'Home (Omni Only)' : 'Home Feed';
      case 'subreddit':
        return config.feedSource ? `r/${config.feedSource}` : 'Subreddit (not set)';
      case 'hub':
        return config.feedSource ? `h/${config.feedSource}` : 'Hub (not set)';
      case 'messages':
        return 'Messages';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="column-config-panel flex-1 border-r border-[var(--color-border)] last:border-r-0">
      {/* Collapsed header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-[var(--color-hover)] transition-cyber border-b border-[var(--color-border)]"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-2 h-2 rounded-full bg-cyan-500 pulse-indicator"></span>
          <span className="truncate font-semibold text-[var(--color-text)]">
            {getFeedLabel()}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3 w-3 text-cyan-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expanded controls */}
      {isExpanded && (
        <div className="p-3 space-y-3 bg-[var(--color-surface)] fade-in">
          {/* Feed type selector */}
          <div>
            <label className="text-xs font-semibold text-cyan-400 block mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              Feed Type
            </label>
            <select
              value={config.feedType}
              onChange={(e) => {
                const newType = e.target.value as ColumnConfig['feedType'];
                updateColumnConfig(columnId, {
                  feedType: newType,
                  feedSource: undefined, // Reset source when changing type
                  cursorStack: [],
                  currentCursor: '',
                });
              }}
              className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-text)] border border-cyan-500/30 rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
            >
              <option value="home">🏠 Home Feed</option>
              <option value="subreddit">📱 Subreddit</option>
              <option value="hub">🌐 Hub</option>
              <option value="messages">💬 Messages</option>
            </select>
          </div>

          {/* Source selector (for subreddit/hub) */}
          {(config.feedType === 'subreddit' || config.feedType === 'hub') && (
            <div>
              <label className="text-xs font-semibold text-cyan-400 block mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                  />
                </svg>
                {config.feedType === 'subreddit' ? 'Subreddit' : 'Hub'} Name
              </label>
              <input
                type="text"
                value={config.feedSource || ''}
                onChange={(e) => {
                  updateColumnConfig(columnId, {
                    feedSource: e.target.value,
                    cursorStack: [],
                    currentCursor: '',
                  });
                }}
                placeholder={config.feedType === 'subreddit' ? 'gaming' : 'technology'}
                className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-text)] border border-cyan-500/30 rounded placeholder:text-[var(--color-text-muted)] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
              />
            </div>
          )}

          {/* Sort selector (not for messages) */}
          {config.feedType !== 'messages' && (
            <div>
              <label className="text-xs font-semibold text-cyan-400 block mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                  />
                </svg>
                Sort By
              </label>
              <select
                value={config.sort}
                onChange={(e) => {
                  updateColumnConfig(columnId, {
                    sort: e.target.value as ColumnConfig['sort'],
                    cursorStack: [],
                    currentCursor: '',
                  });
                }}
                className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-text)] border border-cyan-500/30 rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
              >
                <option value="hot">🔥 Hot</option>
                <option value="new">✨ New</option>
                <option value="top">⬆️ Top</option>
                <option value="rising">📈 Rising</option>
                <option value="controversial">⚡ Controversial</option>
              </select>
            </div>
          )}

          {/* Time range selector (for top/controversial) */}
          {config.feedType !== 'messages' &&
            (config.sort === 'top' || config.sort === 'controversial') && (
              <div>
                <label className="text-xs font-semibold text-cyan-400 block mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Time Range
                </label>
                <select
                  value={config.timeRange}
                  onChange={(e) => {
                    updateColumnConfig(columnId, {
                      timeRange: e.target.value as ColumnConfig['timeRange'],
                      cursorStack: [],
                      currentCursor: '',
                    });
                  }}
                  className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-text)] border border-cyan-500/30 rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
                >
                  <option value="hour">⏰ Hour</option>
                  <option value="day">📅 Day</option>
                  <option value="week">📆 Week</option>
                  <option value="month">🗓️ Month</option>
                  <option value="year">📊 Year</option>
                  <option value="all">♾️ All Time</option>
                </select>
              </div>
            )}

          {/* Omni-only toggle (for home feed) */}
          {config.feedType === 'home' && (
            <div className="flex items-center gap-2 pt-1 border-t border-[var(--color-border)]">
              <input
                type="checkbox"
                id={`omni-only-${columnId}`}
                checked={config.omniOnly || false}
                onChange={(e) => {
                  updateColumnConfig(columnId, {
                    omniOnly: e.target.checked,
                    cursorStack: [],
                    currentCursor: '',
                  });
                }}
                className="w-4 h-4 cursor-pointer accent-cyan-500"
              />
              <label
                htmlFor={`omni-only-${columnId}`}
                className="text-xs text-[var(--color-text)] cursor-pointer font-medium"
              >
                <span className="text-cyan-400">🌐</span> Omni-only (no Reddit)
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
