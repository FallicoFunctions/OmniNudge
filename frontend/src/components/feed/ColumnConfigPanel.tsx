import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMultiColumnFeed } from '../../contexts/MultiColumnFeedContext';
import type { ColumnConfig } from '../../contexts/MultiColumnFeedContext';
import { subscriptionService } from '../../services/subscriptionService';
import { useAuth } from '../../contexts/AuthContext';
import { InlineCreatePost } from './InlineCreatePost';

interface ColumnConfigPanelProps {
  columnId: string;
  config: ColumnConfig;
}

export function ColumnConfigPanel({ columnId, config }: ColumnConfigPanelProps) {
  const { t } = useTranslation();
  const { updateColumnConfig } = useMultiColumnFeed();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const debugLog = (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.log(...args);
    }
  };

  debugLog(
    '[ColumnConfigPanel] Render:',
    columnId,
    'isExpanded:',
    isExpanded,
    'showCreatePost:',
    showCreatePost
  );

  // Check if user can subscribe (must be logged in and have a feedSource)
  const canSubscribe =
    user && config.feedSource && (config.feedType === 'hub' || config.feedType === 'subreddit');

  // Check if user can create posts (must be logged in, have a feedSource, and be hub/subreddit)
  const canCreatePost =
    user && config.feedSource && (config.feedType === 'hub' || config.feedType === 'subreddit');

  // Fetch subscription status
  const { data: subscriptionStatus } = useQuery({
    queryKey: ['subscription', config.feedType, config.feedSource],
    queryFn: () => {
      if (!canSubscribe) return null;
      if (config.feedType === 'hub') {
        return subscriptionService.checkHubSubscription(config.feedSource!);
      } else {
        return subscriptionService.checkSubredditSubscription(config.feedSource!);
      }
    },
    enabled: !!canSubscribe,
  });

  const isSubscribed = subscriptionStatus?.is_subscribed || false;

  // Subscribe/unsubscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!config.feedSource) return;
      if (config.feedType === 'hub') {
        if (isSubscribed) {
          return subscriptionService.unsubscribeFromHub(config.feedSource);
        } else {
          return subscriptionService.subscribeToHub(config.feedSource);
        }
      } else {
        if (isSubscribed) {
          return subscriptionService.unsubscribeFromSubreddit(config.feedSource);
        } else {
          return subscriptionService.subscribeToSubreddit(config.feedSource);
        }
      }
    },
    onSuccess: () => {
      // Invalidate subscription queries
      queryClient.invalidateQueries({
        queryKey: ['subscription', config.feedType, config.feedSource],
      });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const getFeedLabel = () => {
    switch (config.feedType) {
      case 'home':
        return config.omniOnly
          ? t('columnConfigPanel.feedLabel.homeOmniOnly')
          : t('columnConfigPanel.feedLabel.home');
      case 'subreddit':
        return config.feedSource
          ? t('common.format.subredditPath', { name: config.feedSource })
          : t('columnConfigPanel.feedLabel.subredditNotSet');
      case 'hub':
        return config.feedSource
          ? t('common.format.hubPath', { name: config.feedSource })
          : t('columnConfigPanel.feedLabel.hubNotSet');
      case 'messages':
        return t('columnConfigPanel.feedLabel.messages');
      default:
        return t('columnConfigPanel.feedLabel.unknown');
    }
  };

  return (
    <div
      className="column-config-panel flex-1 border-r border-[var(--color-border)] last:border-r-0"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Collapsed header */}
      <div className="w-full border-b border-[var(--color-border)] flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            debugLog(
              '[ColumnConfigPanel] Arrow clicked for column:',
              columnId,
              'current isExpanded:',
              isExpanded
            );
            setIsExpanded(!isExpanded);
          }}
          className="flex-1 px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-[var(--color-hover)] transition-cyber"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-2 h-2 rounded-full bg-cyan-500 pulse-indicator"></span>
            <span className="truncate font-semibold text-[var(--color-primary)]">
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

        {/* Create Post button */}
        {canCreatePost && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              debugLog('[ColumnConfigPanel] Create post clicked for column:', columnId);
              setShowCreatePost(!showCreatePost);
            }}
            className={`px-3 py-2 text-xs transition-colors border-l border-[var(--color-border)] ${
              showCreatePost
                ? 'text-cyan-400 bg-cyan-400/10'
                : 'text-[var(--color-text-muted)] hover:text-cyan-400 hover:bg-cyan-400/10'
            }`}
            title={t('columnConfigPanel.title.createPost')}
          >
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
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        )}

        {/* Subscribe/Unsubscribe button */}
        {canSubscribe && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              subscribeMutation.mutate();
            }}
            disabled={subscribeMutation.isPending}
            className={`px-3 py-2 text-xs font-medium transition-colors border-l border-[var(--color-border)] ${
              isSubscribed
                ? 'text-cyan-400 hover:text-red-400 hover:bg-red-400/10'
                : 'text-[var(--color-text-muted)] hover:text-cyan-400 hover:bg-cyan-400/10'
            } disabled:opacity-50`}
            title={
              isSubscribed
                ? t('columnConfigPanel.title.unsubscribe')
                : t('columnConfigPanel.title.subscribe')
            }
          >
            {subscribeMutation.isPending ? '...' : isSubscribed ? '✓' : '+'}
          </button>
        )}
      </div>

      {/* Inline Create Post Form */}
      {showCreatePost && canCreatePost && (
        <InlineCreatePost
          feedType={config.feedType as 'hub' | 'subreddit'}
          feedSource={config.feedSource!}
          onClose={() => setShowCreatePost(false)}
        />
      )}

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
              {t('columnConfigPanel.feedTypeLabel')}
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
              className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-primary)] border border-cyan-500/30 rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
            >
              <option value="home">{t('columnConfigPanel.feedTypeOption.home')}</option>
              <option value="subreddit">{t('columnConfigPanel.feedTypeOption.subreddit')}</option>
              <option value="hub">{t('columnConfigPanel.feedTypeOption.hub')}</option>
              <option value="messages">{t('columnConfigPanel.feedTypeOption.messages')}</option>
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
                {config.feedType === 'subreddit'
                  ? t('columnConfigPanel.sourceLabel.subreddit')
                  : t('columnConfigPanel.sourceLabel.hub')}
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
                placeholder={
                  config.feedType === 'subreddit'
                    ? t('columnConfigPanel.sourcePlaceholder.subreddit')
                    : t('columnConfigPanel.sourcePlaceholder.hub')
                }
                className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-primary)] border border-cyan-500/30 rounded placeholder:text-[var(--color-text-muted)] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
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
                {t('columnConfigPanel.sortByLabel')}
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
                className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-primary)] border border-cyan-500/30 rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
              >
                <option value="hot">{t('columnConfigPanel.sortOption.hot')}</option>
                <option value="new">{t('columnConfigPanel.sortOption.new')}</option>
                <option value="top">{t('columnConfigPanel.sortOption.top')}</option>
                <option value="rising">{t('columnConfigPanel.sortOption.rising')}</option>
                <option value="controversial">
                  {t('columnConfigPanel.sortOption.controversial')}
                </option>
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
                  {t('columnConfigPanel.timeRangeLabel')}
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
                  className="w-full px-2 py-1.5 text-xs bg-[var(--color-background)] text-[var(--color-primary)] border border-cyan-500/30 rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-cyber"
                >
                  <option value="hour">{t('columnConfigPanel.timeRangeOption.hour')}</option>
                  <option value="day">{t('columnConfigPanel.timeRangeOption.day')}</option>
                  <option value="week">{t('columnConfigPanel.timeRangeOption.week')}</option>
                  <option value="month">{t('columnConfigPanel.timeRangeOption.month')}</option>
                  <option value="year">{t('columnConfigPanel.timeRangeOption.year')}</option>
                  <option value="all">{t('columnConfigPanel.timeRangeOption.all')}</option>
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
                {t('columnConfigPanel.omniOnlyLabel')}
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
