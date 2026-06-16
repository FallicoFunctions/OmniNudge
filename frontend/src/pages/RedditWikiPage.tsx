import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { redditService } from '../services/redditService';
import { sanitizeHttpUrl } from '../utils/crosspostHelpers';
import { useFormat } from '../hooks/useFormat';
import { Panel } from '../components/common/Panel';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { EmptyState } from '../components/empty';
import type {
  RedditSubredditAbout,
  RedditWikiRevisionsResponse,
  RedditWikiDiscussionsResponse,
} from '../types/reddit';

type WikiTab = 'view' | 'history' | 'talk';

interface RedditWikiPageProps {
  mode?: WikiTab;
}

const HISTORY_ROOT_CURSOR = '__root__';

export default function RedditWikiPage({ mode = 'view' }: RedditWikiPageProps = {}) {
  const { subreddit, pagePath = 'index' } = useParams<{ subreddit?: string; pagePath?: string }>();
  const { t } = useTranslation();
  const { formatDate, formatNumber, formatRelativeTime } = useFormat();
  const activeTab: WikiTab = mode ?? 'view';
  const currentPage = pagePath || 'index';
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [subreddit, pagePath, activeTab]);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRevisionId =
    activeTab === 'view' ? (searchParams.get('revision') ?? undefined) : undefined;
  const compareFromId = searchParams.get('compareFrom') ?? undefined;
  const compareToId = searchParams.get('compareTo') ?? undefined;
  const {
    data: wikiData,
    isLoading: wikiLoading,
    isError: wikiIsError,
    error: wikiError,
  } = useQuery({
    queryKey: ['reddit-wiki', subreddit, pagePath, selectedRevisionId ?? 'latest'],
    queryFn: () => {
      if (subreddit) {
        return redditService.getSubredditWikiPage(
          subreddit,
          pagePath || 'index',
          selectedRevisionId
        );
      }
      return redditService.getWikiPage(pagePath || 'index');
    },
    enabled: activeTab === 'view' && (!!subreddit || !!pagePath),
    staleTime: 1000 * 60 * 5,
  });

  // Fetch subreddit about data for sidebar
  const { data: subredditAbout } = useQuery<RedditSubredditAbout>({
    queryKey: ['subreddit-about', subreddit],
    queryFn: () => redditService.getSubredditAbout(subreddit!),
    enabled: !!subreddit,
    staleTime: 1000 * 60 * 10,
  });

  const revisionsAfterCursor = searchParams.get('after') ?? undefined;
  const historyParam = searchParams.get('history');
  const historyStack = useMemo(() => parseHistoryParam(historyParam), [historyParam]);
  const isCompareMode =
    activeTab === 'history' &&
    searchParams.get('compare') === '1' &&
    !!compareFromId &&
    !!compareToId;
  const {
    data: revisionsData,
    isLoading: revisionsLoading,
    isError: revisionsIsError,
    error: revisionsError,
  } = useQuery<RedditWikiRevisionsResponse>({
    queryKey: ['reddit-wiki-revisions', subreddit, pagePath, revisionsAfterCursor, historyParam],
    queryFn: () =>
      redditService.getSubredditWikiRevisions(
        subreddit!,
        pagePath || 'index',
        revisionsAfterCursor
      ),
    enabled: !!subreddit,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: discussionsData,
    isLoading: discussionsLoading,
    isError: discussionsIsError,
    error: discussionsError,
  } = useQuery<RedditWikiDiscussionsResponse>({
    queryKey: ['reddit-wiki-discussions', subreddit, pagePath],
    queryFn: () => redditService.getSubredditWikiDiscussions(subreddit!, pagePath || 'index'),
    enabled: activeTab === 'talk' && !!subreddit,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: comparePayload,
    isLoading: compareLoading,
    isError: compareIsError,
    error: compareError,
  } = useQuery({
    queryKey: ['reddit-wiki-compare', subreddit, pagePath, compareFromId, compareToId],
    queryFn: () =>
      redditService.compareSubredditWikiRevisions(
        subreddit!,
        pagePath || 'index',
        compareFromId!,
        compareToId!
      ),
    enabled: isCompareMode && !!subreddit && !!compareFromId && !!compareToId,
    staleTime: 1000 * 60 * 5,
  });
  const compareFromData = comparePayload?.from;
  const compareToData = comparePayload?.to;
  const [diffModule, setDiffModule] = useState<typeof import('diff') | null>(null);

  useEffect(() => {
    if (!isCompareMode) return;
    let isActive = true;
    import('diff')
      .then((module) => {
        if (isActive) {
          setDiffModule(module);
        }
      })
      .catch((error) => {
        console.error('Failed to load diff module', error);
      });
    return () => {
      isActive = false;
    };
  }, [isCompareMode]);

  const { processedHtml, tocItems } = useMemo(() => {
    return processWikiContent(wikiData?.content_html);
  }, [wikiData?.content_html]);

  const sidebarDescriptionHtml = useMemo(() => {
    if (!subredditAbout?.description_html) return null;
    return sanitizeWikiHtml(subredditAbout.description_html);
  }, [subredditAbout?.description_html]);

  const subredditIcon = useMemo(() => {
    if (!subredditAbout) return null;
    const candidates = [
      subredditAbout.community_icon,
      subredditAbout.icon_img,
      subredditAbout.banner_img,
      subredditAbout.banner_background_image,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const stripped = candidate.split('?')[0];
      const sanitized = sanitizeHttpUrl(stripped);
      if (sanitized) {
        return sanitized;
      }
    }
    return null;
  }, [subredditAbout]);

  const minHeadingLevel = useMemo(() => {
    if (!tocItems.length) {
      return 1;
    }
    return Math.min(...tocItems.map((item) => item.level));
  }, [tocItems]);

  useEffect(() => {
    if (!location.hash) return;
    const targetId = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!targetId) return;
    const el = document.getElementById(targetId) || document.getElementsByName(targetId)[0];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'start' });
    }
  }, [processedHtml, location.hash]);

  const revisionsList = useMemo(() => revisionsData?.revisions ?? [], [revisionsData?.revisions]);
  const compareDiffRows = useMemo<DiffRow[]>(() => {
    if (!isCompareMode || !compareFromData || !compareToData || !diffModule) {
      return [];
    }
    const fromText = (compareFromData?.content_md as string) ?? '';
    const toText = (compareToData?.content_md as string) ?? '';
    if (!fromText && !toText) {
      return [];
    }
    const diff = diffModule.diffLines(fromText, toText);

    // Convert diff chunks into synchronized rows
    const rows: DiffRow[] = [];
    let leftLineNum = 1;
    let rightLineNum = 1;

    diff.forEach((chunk) => {
      const lines = chunk.value.split('\n');
      // Remove last empty line if present (from split)
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }

      lines.forEach((line) => {
        if (chunk.removed) {
          // Removed line: show on left only
          rows.push({
            leftLine: line,
            leftLineNum: leftLineNum++,
            rightLine: null,
            rightLineNum: null,
            type: 'removed',
          });
        } else if (chunk.added) {
          // Added line: show on right only
          rows.push({
            leftLine: null,
            leftLineNum: null,
            rightLine: line,
            rightLineNum: rightLineNum++,
            type: 'added',
          });
        } else {
          // Unchanged line: show on both sides
          rows.push({
            leftLine: line,
            leftLineNum: leftLineNum++,
            rightLine: line,
            rightLineNum: rightLineNum++,
            type: 'equal',
          });
        }
      });
    });

    return rows;
  }, [isCompareMode, compareFromData, compareToData, diffModule]);
  const compareFromMeta = useMemo(
    () =>
      extractRevisionMeta(
        compareFromData,
        comparePayload?.from_id,
        t('redditWikiPage.history.noDescriptionProvided')
      ),
    [compareFromData, comparePayload?.from_id, t]
  );
  const compareToMeta = useMemo(
    () =>
      extractRevisionMeta(
        compareToData,
        comparePayload?.to_id,
        t('redditWikiPage.history.noDescriptionProvided')
      ),
    [compareToData, comparePayload?.to_id, t]
  );

  const canCompare = !!compareFromId && !!compareToId && compareFromId !== compareToId;

  const handleCompareSelect = (side: 'from' | 'to', revisionId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(side === 'from' ? 'compareFrom' : 'compareTo', revisionId);
    if (params.get('compare') === '1') {
      params.delete('compare');
    }
    setSearchParams(params);
  };

  const handleStartCompare = () => {
    if (!canCompare) {
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set('compareFrom', compareFromId!);
    params.set('compareTo', compareToId!);
    params.set('compare', '1');
    setSearchParams(params);
  };

  const handleExitCompare = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('compare');
    setSearchParams(params);
  };

  const tabLinks = useMemo(() => {
    if (!subreddit) {
      return [];
    }
    return [
      {
        key: 'view' as WikiTab,
        label: t('redditWikiPage.tabs.view'),
        to: `/r/${subreddit}/wiki/${currentPage}`,
      },
      {
        key: 'history' as WikiTab,
        label: t('redditWikiPage.tabs.history'),
        to: `/r/${subreddit}/wiki/revisions/${currentPage}`,
      },
      {
        key: 'talk' as WikiTab,
        label: t('redditWikiPage.tabs.talk'),
        to: `/r/${subreddit}/wiki/discussions/${currentPage}`,
      },
    ];
  }, [currentPage, subreddit, t]);

  const revisionIndicator = useMemo(() => {
    if (activeTab !== 'view') {
      return null;
    }

    const revisionId = searchParams.get('revision');
    if (!revisionId) {
      return null;
    }

    const revision = revisionsList.find((rev) => rev.id === revisionId);
    if (revision) {
      return formatRelativeTime(new Date(revision.timestamp * 1000));
    }

    if (typeof wikiData?.revision_date === 'number') {
      return formatRelativeTime(new Date(wikiData.revision_date * 1000));
    }
    return null;
  }, [activeTab, revisionsList, searchParams, wikiData?.revision_date, formatRelativeTime]);

  const isCurrentLoading =
    activeTab === 'view'
      ? wikiLoading
      : activeTab === 'history'
        ? revisionsLoading
        : discussionsLoading;

  const isCurrentError =
    activeTab === 'view'
      ? wikiIsError
      : activeTab === 'history'
        ? revisionsIsError
        : discussionsIsError;

  const currentError =
    activeTab === 'view' ? wikiError : activeTab === 'history' ? revisionsError : discussionsError;

  if (isCurrentLoading) {
    const loadingMessage =
      activeTab === 'view'
        ? t('redditWikiPage.loading.wikiPage')
        : activeTab === 'history'
          ? t('redditWikiPage.loading.revisionHistory')
          : t('redditWikiPage.loading.discussions');
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingMessage>{loadingMessage}</LoadingMessage>
      </div>
    );
  }

  if (isCurrentError) {
    const message =
      activeTab === 'view'
        ? t('redditWikiPage.errors.viewNotAccessible')
        : activeTab === 'history'
          ? t('redditWikiPage.errors.historyFailed')
          : t('redditWikiPage.errors.talkFailed');
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <h2 className="text-lg font-semibold text-red-800">{t('redditWikiPage.errors.title')}</h2>
          <ErrorMessage className="mt-2 text-sm text-red-700">
            {currentError instanceof Error ? currentError.message : message}
          </ErrorMessage>
          {subreddit && activeTab !== 'talk' && (
            <a
              href={`/r/${subreddit}`}
              className="mt-4 inline-block text-sm font-medium text-red-800 hover:underline"
            >
              {t('redditWikiPage.actions.backToSubreddit', { subreddit })}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Subreddit Header with Navigation */}
      {subreddit && (
        <div className="mb-4">
          {/* Top row: Subreddit name and icon */}
          <div className="mb-4 flex items-center gap-3">
            {subredditIcon && (
              <img
                src={subredditIcon}
                alt=""
                className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
              {t('redditWikiPage.header.title', { subreddit })}
            </h1>
          </div>

          {/* Sort and Wiki buttons row */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/r/${subreddit}`}
              className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium capitalize text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
            >
              {t('home.sort.hot')}
            </Link>
            <Link
              to={`/r/${subreddit}`}
              className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium capitalize text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
            >
              {t('home.sort.new')}
            </Link>
            <Link
              to={`/r/${subreddit}`}
              className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium capitalize text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
            >
              {t('home.sort.top')}
            </Link>
            <Link
              to={`/r/${subreddit}`}
              className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium capitalize text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
            >
              {t('home.sort.rising')}
            </Link>
            <Link
              to={`/r/${subreddit}`}
              className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium capitalize text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
            >
              {t('home.sort.controversial')}
            </Link>
            <Link
              to={`/r/${subreddit}/wiki/index`}
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium capitalize text-white"
            >
              {t('hubPage.controls.wiki')}
            </Link>
          </div>
        </div>
      )}

      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold capitalize text-[var(--color-text-primary)]">
            {currentPage}
          </div>
          {tabLinks.length > 0 && (
            <div className="inline-flex overflow-hidden rounded-full border border-[var(--color-border)] text-sm">
              {tabLinks.map((tab) => (
                <Link
                  key={tab.key}
                  to={tab.to}
                  aria-current={tab.key === activeTab ? 'page' : undefined}
                  className={`px-4 py-1 capitalize ${
                    tab.key === activeTab
                      ? 'bg-[#d4e7ff] font-semibold text-[#0a66c2]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary,#f4f6fb)]'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {activeTab === 'view' && (
          <div className="lg:clearfix">
            {revisionIndicator && (
              <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                {t('redditWikiPage.view.revisionBanner', { time: revisionIndicator })}
              </div>
            )}
            {subreddit && subredditAbout && (
              <aside className="mb-4 space-y-4 lg:mb-0 lg:float-right lg:ml-6 lg:w-64">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {t('redditWikiPage.sidebar.aboutTitle')}
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {t('common.format.subredditPath', { name: subreddit })}
                  </h3>
                  {sidebarDescriptionHtml ? (
                    <div
                      className="mt-3 text-sm text-[var(--color-text-primary)] reddit-wiki-content"
                      dangerouslySetInnerHTML={{ __html: sidebarDescriptionHtml }}
                    />
                  ) : (
                    <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                      {subredditAbout.public_description ||
                        t('subredditAboutPanel.emptyDescription')}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {t('redditWikiPage.sidebar.communityTitle')}
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-[var(--color-text-secondary)]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {t('subredditAboutPanel.labels.members')}
                      </span>
                      <span className="text-[var(--color-text-primary)]">
                        {typeof subredditAbout.subscribers === 'number'
                          ? formatNumber(subredditAbout.subscribers)
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {t('redditWikiPage.sidebar.labels.online')}
                      </span>
                      <span className="text-[var(--color-text-primary)]">
                        {typeof subredditAbout.active_user_count === 'number'
                          ? formatNumber(subredditAbout.active_user_count)
                          : '—'}
                      </span>
                    </div>
                    {subredditAbout.created_utc && (
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--color-text-primary)]">
                          {t('subredditAboutPanel.labels.created')}
                        </span>
                        <span className="text-[var(--color-text-primary)]">
                          {formatDate(new Date(subredditAbout.created_utc * 1000), {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            )}

            {tocItems.length > 0 && (
              <nav
                className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:mb-0 lg:float-right lg:ml-6 lg:w-64"
                aria-label={t('redditWikiPage.toc.ariaLabel')}
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {t('redditWikiPage.toc.title')}
                </div>
                <ul className="space-y-1 text-sm">
                  {tocItems.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="text-[var(--color-link,#0079d3)] hover:underline"
                        style={{ marginInlineStart: `${(item.level - minHeadingLevel) * 12}px` }}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {processedHtml ? (
              <div
                className="reddit-wiki-content max-w-none text-[var(--color-text-primary)]"
                style={{ fontSize: '14px', lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{ __html: processedHtml }}
              />
            ) : (
              <EmptyState illustration="noData" title={t('redditWikiPage.view.empty')} />
            )}
            <div className="hidden lg:block clear-both" aria-hidden="true" />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="border-t border-[var(--color-border)]">
            {isCompareMode ? (
              <div className="space-y-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {t('redditWikiPage.history.comparing')}
                  </div>
                  <button
                    type="button"
                    onClick={handleExitCompare}
                    className="rounded border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-link,#0079d3)]"
                  >
                    {t('redditWikiPage.history.actions.backToHistory')}
                  </button>
                </div>
                {compareLoading ? (
                  <div className="py-12 text-center">
                    <LoadingMessage className="text-sm">
                      {t('redditWikiPage.history.loadingComparison')}
                    </LoadingMessage>
                  </div>
                ) : compareIsError ? (
                  <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {compareError instanceof Error
                      ? compareError.message
                      : t('redditWikiPage.history.errors.unableToLoadSelected')}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <RevisionSummaryCard
                        title={t('redditWikiPage.history.olderRevision')}
                        meta={compareFromMeta}
                      />
                      <RevisionSummaryCard
                        title={t('redditWikiPage.history.newerRevision')}
                        meta={compareToMeta}
                        alignRight
                      />
                    </div>
                    {compareDiffRows.length ? (
                      <div className="overflow-x-auto">
                        <div className="inline-block min-w-full border border-[var(--color-border)]">
                          {/* Header row */}
                          <div className="grid grid-cols-2 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary,#f4f6fb)]">
                            <div className="border-r border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
                              {compareFromMeta?.timestamp
                                ? formatRelativeTime(new Date(compareFromMeta.timestamp * 1000))
                                : t('redditWikiPage.history.olderRevision')}
                            </div>
                            <div className="px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
                              {compareToMeta?.timestamp
                                ? formatRelativeTime(new Date(compareToMeta.timestamp * 1000))
                                : t('redditWikiPage.history.newerRevision')}
                            </div>
                          </div>
                          {/* Diff rows */}
                          {compareDiffRows.map((row, index) => (
                            <div key={index} className="grid grid-cols-2">
                              {/* Left side (old) */}
                              <div
                                className={`flex border-r border-[var(--color-border)] ${
                                  row.type === 'removed' ? 'bg-red-50' : 'bg-white'
                                }`}
                              >
                                <div className="w-10 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-secondary,#f4f6fb)] px-1 py-0.5 text-right text-[10px] text-[var(--color-text-secondary)]">
                                  {row.leftLineNum ?? ''}
                                </div>
                                <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-words px-1 py-0.5 font-mono text-[11px] leading-tight">
                                  {row.leftLine ?? '\u00A0'}
                                </pre>
                              </div>
                              {/* Right side (new) */}
                              <div
                                className={`flex ${
                                  row.type === 'added' ? 'bg-green-50' : 'bg-white'
                                }`}
                              >
                                <div className="w-10 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-secondary,#f4f6fb)] px-1 py-0.5 text-right text-[10px] text-[var(--color-text-secondary)]">
                                  {row.rightLineNum ?? ''}
                                </div>
                                <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-words px-1 py-0.5 font-mono text-[11px] leading-tight">
                                  {row.rightLine ?? '\u00A0'}
                                </pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-secondary,#f7f9fc)] p-6 text-center">
                        <EmptyState
                          illustration="noResults"
                          title={t('redditWikiPage.history.noDifferences')}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[50px_50px_160px_120px_180px_1fr_120px] gap-4 border-b border-[var(--color-border)] py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] md:grid">
                  <span className="col-span-2 text-center">
                    {t('redditWikiPage.history.headers.compare')}
                  </span>
                  <span>{t('redditWikiPage.history.headers.when')}</span>
                  <span>{t('redditWikiPage.history.headers.page')}</span>
                  <span>{t('redditWikiPage.history.headers.author')}</span>
                  <span>{t('redditWikiPage.history.headers.reason')}</span>
                  <span>{t('redditWikiPage.history.headers.actions')}</span>
                </div>
                {revisionsList.length ? (
                  revisionsList.map((revision) => {
                    const authorData = revision.author?.data;
                    const normalizedAuthorName = authorData?.name
                      ?.replace(/^u\//i, '')
                      ?.replace(/^\/+/, '')
                      ?.trim();
                    const displayAuthor = authorData?.display_name_prefixed?.trim();
                    const authorName = displayAuthor
                      ? displayAuthor
                      : normalizedAuthorName
                        ? t('common.format.userPath', { name: normalizedAuthorName })
                        : t('redditWikiPage.history.unknownAuthor');
                    const changeSummary =
                      revision.reason || t('redditWikiPage.history.noDescriptionProvided');
                    const revisionTime = formatRelativeTime(new Date(revision.timestamp * 1000));
                    return (
                      <div
                        key={revision.id}
                        className="grid gap-3 border-b border-[var(--color-border)] py-3 text-sm text-[var(--color-text-primary)] md:grid-cols-[50px_50px_160px_120px_180px_1fr_120px]"
                      >
                        <div className="flex items-center justify-center">
                          <input
                            type="radio"
                            name="compare-from"
                            className="h-4 w-4 accent-[#0a66c2]"
                            checked={compareFromId === revision.id}
                            onChange={() => handleCompareSelect('from', revision.id)}
                            aria-label={t('redditWikiPage.history.aria.selectOlder', {
                              page: revision.page,
                              time: revisionTime,
                            })}
                          />
                        </div>
                        <div className="flex items-center justify-center">
                          <input
                            type="radio"
                            name="compare-to"
                            className="h-4 w-4 accent-[#0a66c2]"
                            checked={compareToId === revision.id}
                            onChange={() => handleCompareSelect('to', revision.id)}
                            aria-label={t('redditWikiPage.history.aria.selectNewer', {
                              page: revision.page,
                              time: revisionTime,
                            })}
                          />
                        </div>
                        <div className="text-[var(--color-text-secondary)]">{revisionTime}</div>
                        <div className="font-semibold">
                          {subreddit ? (
                            <Link
                              to={`/r/${subreddit}/wiki/${revision.page}`}
                              className="text-[var(--color-link,#0079d3)] hover:underline"
                            >
                              {revision.page}
                            </Link>
                          ) : (
                            revision.page
                          )}
                        </div>
                        {normalizedAuthorName ? (
                          <Link
                            to={`/user/${normalizedAuthorName}`}
                            className="truncate font-semibold text-[var(--color-link,#0079d3)] hover:underline"
                          >
                            {authorName}
                          </Link>
                        ) : (
                          <div className="truncate text-[var(--color-text-secondary)]">
                            {authorName}
                          </div>
                        )}
                        <div className="truncate" title={changeSummary}>
                          {changeSummary}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[var(--color-link,#0079d3)]">
                          <Link
                            to={`/r/${subreddit}/wiki/${currentPage}?revision=${revision.id}`}
                            className="font-semibold hover:underline"
                          >
                            {t('redditWikiPage.history.actions.view')}
                          </Link>
                          {revision.revision_hidden && (
                            <span className="text-xs text-[var(--color-text-secondary)]">
                              {t('redditWikiPage.history.hidden')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-sm text-[var(--color-text-secondary)]">
                    {t('redditWikiPage.history.empty')}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
                  <div className="flex-1">
                    {historyStack.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextHistory = historyStack.slice(0, -1);
                          const previousCursor = historyStack[historyStack.length - 1];
                          const params = new URLSearchParams(searchParams);
                          const serializedHistory = serializeHistoryParam(nextHistory);
                          if (serializedHistory) {
                            params.set('history', serializedHistory);
                          } else {
                            params.delete('history');
                          }

                          if (!previousCursor || previousCursor === HISTORY_ROOT_CURSOR) {
                            params.delete('after');
                          } else {
                            params.set('after', previousCursor);
                          }
                          setSearchParams(params);
                        }}
                        className="rounded border border-[var(--color-border)] px-4 py-2 font-semibold text-[var(--color-link,#0079d3)]"
                      >
                        {t('redditWikiPage.history.actions.newer')}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-1 justify-center">
                    <button
                      type="button"
                      onClick={handleStartCompare}
                      disabled={!canCompare}
                      className={`rounded border px-4 py-2 font-semibold ${
                        canCompare
                          ? 'border-[var(--color-border)] text-[var(--color-link,#0079d3)]'
                          : 'cursor-not-allowed border-[var(--color-border)] text-[var(--color-text-secondary)] opacity-60'
                      }`}
                    >
                      {t('redditWikiPage.history.actions.compareSelected')}
                    </button>
                  </div>
                  <div className="flex flex-1 justify-end">
                    {revisionsData?.after && (
                      <button
                        type="button"
                        onClick={() => {
                          const params = new URLSearchParams(searchParams);
                          const nextHistory = [
                            ...historyStack,
                            revisionsAfterCursor ?? HISTORY_ROOT_CURSOR,
                          ];
                          const serializedHistory = serializeHistoryParam(nextHistory);
                          if (serializedHistory) {
                            params.set('history', serializedHistory);
                          } else {
                            params.delete('history');
                          }
                          params.set('after', revisionsData.after || '');
                          setSearchParams(params);
                        }}
                        className="rounded border border-[var(--color-border)] px-4 py-2 font-semibold text-[var(--color-link,#0079d3)]"
                      >
                        {t('redditWikiPage.history.actions.older')}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'talk' && (
          <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
            {discussionsData?.discussions?.length ? (
              discussionsData.discussions.map((discussion) => (
                <div
                  key={discussion.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary,#f7f9fc)] p-4"
                >
                  <Link
                    to={`/r/${discussion.subreddit}/comments/${discussion.id}`}
                    className="text-base font-semibold text-[var(--color-link,#0079d3)] hover:underline"
                  >
                    {discussion.title}
                  </Link>
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {discussion.created_utc
                      ? t('redditWikiPage.talk.postedByOn', {
                          author: discussion.author,
                          date: formatDate(new Date(discussion.created_utc * 1000), {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }),
                        })
                      : t('redditWikiPage.talk.postedBy', { author: discussion.author })}
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    {t('posts.comment', {
                      count: discussion.num_comments ?? 0,
                      formattedCount: formatNumber(discussion.num_comments ?? 0),
                    })}{' '}
                    ·{' '}
                    {t('posts.point', {
                      count: discussion.score ?? 0,
                      formattedCount: formatNumber(discussion.score ?? 0),
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary,#f7f9fc)] p-6 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {t('redditWikiPage.talk.empty')}
                </p>
                {subreddit && (
                  <button
                    type="button"
                    onClick={() => alert(t('redditWikiPage.talk.alertNotSupported'))}
                    className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--color-link,#0079d3)] px-4 py-2 text-sm font-semibold text-[var(--color-link,#0079d3)] hover:bg-[var(--color-link,#0079d3)] hover:text-white"
                  >
                    {t('redditWikiPage.talk.actions.submitDiscussion')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface DiffRow {
  leftLine: string | null;
  leftLineNum: number | null;
  rightLine: string | null;
  rightLineNum: number | null;
  type: 'added' | 'removed' | 'equal';
}

interface RevisionMeta {
  author?: string;
  timestamp?: number;
  reason?: string;
  revisionId?: string;
}

interface RevisionSummaryCardProps {
  title: string;
  meta: RevisionMeta | null;
  alignRight?: boolean;
}

function RevisionSummaryCard({ title, meta, alignRight = false }: RevisionSummaryCardProps) {
  const { t } = useTranslation();
  const { formatDate, formatRelativeTime } = useFormat();

  return (
    <div
      className={`rounded border border-[var(--color-border)] bg-[var(--color-surface-secondary,#f7f9fc)] p-4 ${
        alignRight ? 'md:text-right' : ''
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {title}
      </div>
      {meta ? (
        <>
          {meta.timestamp && (
            <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
              {formatRelativeTime(new Date(meta.timestamp * 1000))}
              <span className="ml-1 text-[var(--color-text-secondary)]">
                {t('redditWikiPage.history.absoluteDate', {
                  date: formatDate(new Date(meta.timestamp * 1000), {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                })}
              </span>
            </div>
          )}
          {meta.author && (
            <div className="text-sm text-[var(--color-text-secondary)]">
              {t('common.format.userPath', {
                name: meta.author.replace(/^u\//i, '').replace(/^\/+/, '').trim() || meta.author,
              })}
            </div>
          )}
          {meta.reason && (
            <div className="mt-2 text-xs text-[var(--color-text-secondary)]">{meta.reason}</div>
          )}
          {meta.revisionId && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
              {t('redditWikiPage.history.revisionId', { id: meta.revisionId })}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {t('redditWikiPage.history.revisionUnavailable')}
        </div>
      )}
    </div>
  );
}

function processWikiContent(content?: string | null): {
  processedHtml: string | null;
  tocItems: TocItem[];
} {
  if (!content) {
    return { processedHtml: null, tocItems: [] };
  }

  const sanitized = sanitizeWikiHtml(content);

  if (typeof document === 'undefined') {
    return { processedHtml: sanitized, tocItems: [] };
  }

  const template = document.createElement('template');
  template.innerHTML = sanitized;

  template.content.querySelectorAll('.toc').forEach((el) => el.remove());

  const headingSelector = 'h1, h2, h3, h4, h5, h6';
  const slugCounts = new Map<string, number>();
  const tocItems: TocItem[] = [];

  template.content.querySelectorAll(headingSelector).forEach((heading, index) => {
    const text = heading.textContent?.trim();
    if (!text) {
      return;
    }

    const level = Number(heading.tagName.substring(1));
    const existingId = heading.getAttribute('id') || heading.getAttribute('name');
    let slug = existingId || slugifyHeading(text);
    if (!slug) {
      slug = `section-${index + 1}`;
    }

    if (!existingId) {
      if (slugCounts.has(slug)) {
        const count = (slugCounts.get(slug) ?? 0) + 1;
        slugCounts.set(slug, count);
        slug = `${slug}-${count}`;
      } else {
        slugCounts.set(slug, 0);
      }
      (heading as HTMLElement).setAttribute('id', slug);
    }

    tocItems.push({ id: slug, text, level: Number.isNaN(level) ? 1 : level });
  });

  return { processedHtml: template.innerHTML, tocItems };
}

function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizeWikiHtml(content: string): string {
  if (typeof document === 'undefined') return content;

  // Decode HTML entities first
  const decoded = decodeHtmlEntities(content);

  // Remove HTML comments
  const cleaned = decoded.replace(/<!--[\s\S]*?-->/g, '');
  const sanitized = DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS: [
      'a',
      'p',
      'strong',
      'em',
      'ul',
      'ol',
      'li',
      'span',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'img',
      'blockquote',
      'code',
      'pre',
      'hr',
      'br',
    ],
    ALLOWED_ATTR: ['href', 'title', 'id', 'name', 'src', 'alt', 'width', 'height', 'class', 'colspan', 'rowspan'],
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;

  template.content.querySelectorAll('*').forEach((element) => {
    const el = element as HTMLElement;
    const tag = el.tagName.toLowerCase();

    Array.from(el.attributes).forEach((attr) => {
      const attrName = attr.name.toLowerCase();

      if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attr.value)) {
        el.removeAttribute(attr.name);
        return;
      }
    });

    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href) {
        const isInternalLink =
          href.startsWith('/r/') ||
          href.startsWith('/u/') ||
          href.startsWith('/user/') ||
          href.startsWith('/wiki/');

        if (!isInternalLink) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }
  });

  return template.innerHTML;
}

function isSafeUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function decodeHtmlEntities(text: string): string {
  if (typeof document === 'undefined') return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function extractRevisionMeta(
  data: unknown,
  explicitId: string | undefined,
  fallbackReason: string
): RevisionMeta | null {
  if (!data) {
    return null;
  }
  // Type assertion for Reddit API data structure
  const apiData = data as Record<string, unknown>;
  const revisionBy = apiData.revision_by as Record<string, unknown> | undefined;
  const revisionByData = revisionBy?.data as Record<string, unknown> | undefined;

  const rawAuthorName = (revisionByData?.name as string | undefined)
    ?.replace(/^u\//i, '')
    ?.replace(/^\/+/, '')
    ?.trim();
  const author =
    (revisionByData?.display_name_prefixed as string | undefined)?.trim() ??
    rawAuthorName;

  let timestamp: number | undefined;
  if (typeof apiData.revision_date === 'number') {
    timestamp = apiData.revision_date;
  } else if (typeof apiData.revision_date === 'string') {
    const parsed = Number(apiData.revision_date);
    if (!Number.isNaN(parsed)) {
      timestamp = parsed;
    }
  }

  const reason = (apiData.reason as string | undefined) || fallbackReason;
  const revisionId =
    explicitId ||
    (typeof apiData.revision_id === 'string' ? apiData.revision_id : undefined) ||
    undefined;
  return { author, timestamp, reason, revisionId };
}

function parseHistoryParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((entry) => decodeURIComponent(entry));
}

function serializeHistoryParam(stack: string[]): string | null {
  if (!stack.length) return null;
  return stack.map((entry) => encodeURIComponent(entry)).join(',');
}
