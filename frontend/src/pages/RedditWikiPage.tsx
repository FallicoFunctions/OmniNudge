import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { diffLines } from 'diff';
import { redditService } from '../services/redditService';
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
  const activeTab: WikiTab = mode ?? 'view';
  const currentPage = pagePath || 'index';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [subreddit, pagePath, activeTab]);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRevisionId = activeTab === 'view' ? searchParams.get('revision') ?? undefined : undefined;
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
        return redditService.getSubredditWikiPage(subreddit, pagePath || 'index', selectedRevisionId);
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
  const isCompareMode = activeTab === 'history' && searchParams.get('compare') === '1' && !!compareFromId && !!compareToId;
  const {
    data: revisionsData,
    isLoading: revisionsLoading,
    isError: revisionsIsError,
    error: revisionsError,
  } = useQuery<RedditWikiRevisionsResponse>({
    queryKey: ['reddit-wiki-revisions', subreddit, pagePath, revisionsAfterCursor, historyParam],
    queryFn: () => redditService.getSubredditWikiRevisions(subreddit!, pagePath || 'index', revisionsAfterCursor),
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

  const { processedHtml, tocItems } = useMemo(() => {
    return processWikiContent(wikiData?.content_html);
  }, [wikiData?.content_html]);

  const sidebarDescriptionHtml = useMemo(() => {
    if (!subredditAbout?.description_html) return null;
    return sanitizeWikiHtml(subredditAbout.description_html);
  }, [subredditAbout?.description_html]);

  const minHeadingLevel = useMemo(() => {
    if (!tocItems.length) {
      return 1;
    }
    return Math.min(...tocItems.map((item) => item.level));
  }, [tocItems]);

  const revisionsList = revisionsData?.revisions ?? [];
  const compareDiffRows = useMemo<DiffRow[]>(() => {
    if (!isCompareMode || !compareFromData || !compareToData) {
      return [];
    }
    const fromText = (compareFromData?.content_md as string) ?? '';
    const toText = (compareToData?.content_md as string) ?? '';
    if (!fromText && !toText) {
      return [];
    }
    const diff = diffLines(fromText, toText);

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
  }, [isCompareMode, compareFromData, compareToData]);
  const compareFromMeta = useMemo(
    () => extractRevisionMeta(compareFromData, comparePayload?.from_id),
    [compareFromData, comparePayload?.from_id]
  );
  const compareToMeta = useMemo(
    () => extractRevisionMeta(compareToData, comparePayload?.to_id),
    [compareToData, comparePayload?.to_id]
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
      { key: 'view' as WikiTab, label: 'view', to: `/r/${subreddit}/wiki/${currentPage}` },
      {
        key: 'history' as WikiTab,
        label: 'history',
        to: `/r/${subreddit}/wiki/revisions/${currentPage}`,
      },
      {
        key: 'talk' as WikiTab,
        label: 'talk',
        to: `/r/${subreddit}/wiki/discussions/${currentPage}`,
      },
    ];
  }, [subreddit, currentPage]);

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
      return formatRelativeTime(revision.timestamp);
    }

    if (typeof wikiData?.revision_date === 'number') {
      return formatRelativeTime(wikiData.revision_date);
    }
    return null;
  }, [activeTab, revisionsList, searchParams, wikiData?.revision_date]);

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
    activeTab === 'view'
      ? wikiError
      : activeTab === 'history'
      ? revisionsError
      : discussionsError;

  if (isCurrentLoading) {
    const loadingMessage =
      activeTab === 'view'
        ? 'Loading wiki page...'
        : activeTab === 'history'
        ? 'Loading revision history...'
        : 'Loading discussions...';
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">{loadingMessage}</div>
      </div>
    );
  }

  if (isCurrentError) {
    const message =
      activeTab === 'view'
        ? 'This wiki page does not exist or is not accessible.'
        : activeTab === 'history'
        ? 'We could not load the revision history for this page.'
        : 'We could not load discussions for this page.';
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <h2 className="text-lg font-semibold text-red-800">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-700">
            {currentError instanceof Error ? currentError.message : message}
          </p>
          {subreddit && activeTab !== 'talk' && (
            <a
              href={`/r/${subreddit}`}
              className="mt-4 inline-block text-sm font-medium text-red-800 hover:underline"
            >
              ← Back to r/{subreddit}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        {subreddit ? (
          <>
            <a href={`/r/${subreddit}`} className="hover:underline">
              r/{subreddit}
            </a>
            <span>/</span>
            <span>wiki</span>
            <span>/</span>
            <span>{pagePath || 'index'}</span>
          </>
        ) : (
          <>
            <span>wiki</span>
            <span>/</span>
            <span>{pagePath || 'index'}</span>
          </>
        )}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
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
                Viewing revision from {revisionIndicator}.
              </div>
            )}
            {subreddit && subredditAbout && (
              <aside className="mb-4 space-y-4 lg:mb-0 lg:float-right lg:ml-6 lg:w-64">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    About This Subreddit
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">r/{subreddit}</h3>
                  {sidebarDescriptionHtml ? (
                    <div
                      className="mt-3 text-sm text-[var(--color-text-primary)] reddit-wiki-content"
                      dangerouslySetInnerHTML={{ __html: sidebarDescriptionHtml }}
                    />
                  ) : (
                    <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                      {subredditAbout.public_description || 'No description provided'}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Community Info
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-[var(--color-text-secondary)]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--color-text-primary)]">Members</span>
                      <span className="text-[var(--color-text-primary)]">
                        {typeof subredditAbout.subscribers === 'number'
                          ? subredditAbout.subscribers.toLocaleString()
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--color-text-primary)]">Online</span>
                      <span className="text-[var(--color-text-primary)]">
                        {typeof subredditAbout.active_user_count === 'number'
                          ? subredditAbout.active_user_count.toLocaleString()
                          : '—'}
                      </span>
                    </div>
                    {subredditAbout.created_utc && (
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--color-text-primary)]">Created</span>
                        <span className="text-[var(--color-text-primary)]">
                          {new Date(subredditAbout.created_utc * 1000).toLocaleDateString()}
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
                aria-label="Table of contents"
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Table of Contents
                </div>
                <ul className="space-y-1 text-sm">
                  {tocItems.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="text-[var(--color-link,#0079d3)] hover:underline"
                        style={{ marginLeft: `${(item.level - minHeadingLevel) * 12}px` }}
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
              <p className="text-[var(--color-text-secondary)]">This wiki page is empty.</p>
            )}
            <div className="hidden lg:block clear-both" aria-hidden="true" />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="border-t border-[var(--color-border)]">
            {isCompareMode ? (
              <div className="space-y-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">Comparing revisions</div>
                  <button
                    type="button"
                    onClick={handleExitCompare}
                    className="rounded border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-link,#0079d3)]"
                  >
                    ← Back to history
                  </button>
                </div>
                {compareLoading ? (
                  <div className="py-12 text-center text-sm text-[var(--color-text-secondary)]">
                    Loading comparison…
                  </div>
                ) : compareIsError ? (
                  <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {compareError instanceof Error ? compareError.message : 'Unable to load the selected revisions.'}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <RevisionSummaryCard title="Older revision" meta={compareFromMeta} />
                      <RevisionSummaryCard title="Newer revision" meta={compareToMeta} alignRight />
                    </div>
                    {compareDiffRows.length ? (
                      <div className="overflow-x-auto">
                        <div className="inline-block min-w-full border border-[var(--color-border)]">
                          {/* Header row */}
                          <div className="grid grid-cols-2 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary,#f4f6fb)]">
                            <div className="border-r border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
                              {compareFromMeta?.timestamp ? formatRelativeTime(compareFromMeta.timestamp) : 'Older revision'}
                            </div>
                            <div className="px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
                              {compareToMeta?.timestamp ? formatRelativeTime(compareToMeta.timestamp) : 'Newer revision'}
                            </div>
                          </div>
                          {/* Diff rows */}
                          {compareDiffRows.map((row, index) => (
                            <div
                              key={index}
                              className="grid grid-cols-2"
                            >
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
                      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-secondary,#f7f9fc)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
                        No differences detected between these revisions.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[50px_50px_160px_120px_180px_1fr_120px] gap-4 border-b border-[var(--color-border)] py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] md:grid">
                  <span className="text-center"></span>
                  <span className="text-center"></span>
                  <span>When</span>
                  <span>Page</span>
                  <span>Author</span>
                  <span>Reason</span>
                  <span>Actions</span>
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
                      ? `u/${normalizedAuthorName}`
                      : 'u/unknown';
                    const changeSummary = revision.reason || 'No description provided';
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
                            aria-label={`Select ${revision.page} revision from ${formatRelativeTime(
                              revision.timestamp
                            )} as the older version`}
                          />
                        </div>
                        <div className="flex items-center justify-center">
                          <input
                            type="radio"
                            name="compare-to"
                            className="h-4 w-4 accent-[#0a66c2]"
                            checked={compareToId === revision.id}
                            onChange={() => handleCompareSelect('to', revision.id)}
                            aria-label={`Select ${revision.page} revision from ${formatRelativeTime(
                              revision.timestamp
                            )} as the newer version`}
                          />
                        </div>
                        <div className="text-[var(--color-text-secondary)]">{formatRelativeTime(revision.timestamp)}</div>
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
                            to={`/reddit/user/${normalizedAuthorName}`}
                            className="truncate font-semibold text-[var(--color-link,#0079d3)] hover:underline"
                          >
                            {authorName}
                          </Link>
                        ) : (
                          <div className="truncate text-[var(--color-text-secondary)]">{authorName}</div>
                        )}
                        <div className="truncate" title={changeSummary}>
                          {changeSummary}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[var(--color-link,#0079d3)]">
                          <Link
                            to={`/r/${subreddit}/wiki/${currentPage}?revision=${revision.id}`}
                            className="font-semibold hover:underline"
                          >
                            View
                          </Link>
                          {revision.revision_hidden && (
                            <span className="text-xs text-[var(--color-text-secondary)]">Hidden</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-sm text-[var(--color-text-secondary)]">
                    This page has no recorded revisions.
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
                        ← Newer
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
                      Compare selected
                    </button>
                  </div>
                  <div className="flex flex-1 justify-end">
                    {revisionsData?.after && (
                      <button
                        type="button"
                        onClick={() => {
                          const params = new URLSearchParams(searchParams);
                          const nextHistory = [...historyStack, revisionsAfterCursor ?? HISTORY_ROOT_CURSOR];
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
                        Older →
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
                    Posted by u/{discussion.author}{' '}
                    {discussion.created_utc
                      ? `on ${new Date(discussion.created_utc * 1000).toLocaleDateString()}`
                      : ''}
                  </div>
                  <div className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    {discussion.num_comments ?? 0} comments · {discussion.score ?? 0} points
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary,#f7f9fc)] p-6 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  There doesn&apos;t seem to be anything here.
                </p>
                {subreddit && (
                  <a
                    href={`https://www.reddit.com/r/${subreddit}/submit?selftext=true&title=${encodeURIComponent(
                      `${currentPage} wiki discussion`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--color-link,#0079d3)] px-4 py-2 text-sm font-semibold text-[var(--color-link,#0079d3)] hover:bg-[var(--color-link,#0079d3)] hover:text-white"
                  >
                    Submit a discussion
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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
  return (
    <div
      className={`rounded border border-[var(--color-border)] bg-[var(--color-surface-secondary,#f7f9fc)] p-4 ${
        alignRight ? 'md:text-right' : ''
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">{title}</div>
      {meta ? (
        <>
          {meta.timestamp && (
            <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
              {formatRelativeTime(meta.timestamp)}
              <span className="ml-1 text-[var(--color-text-secondary)]">
                ({formatAbsoluteDate(meta.timestamp)})
              </span>
            </div>
          )}
          {meta.author && (
            <div className="text-sm text-[var(--color-text-secondary)]">{meta.author}</div>
          )}
          {meta.reason && (
            <div className="mt-2 text-xs text-[var(--color-text-secondary)]">{meta.reason}</div>
          )}
          {meta.revisionId && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
              Revision ID: {meta.revisionId}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 text-sm text-[var(--color-text-secondary)]">Revision unavailable.</div>
      )}
    </div>
  );
}

function processWikiContent(content?: string | null): { processedHtml: string | null; tocItems: TocItem[] } {
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
    let slug = slugifyHeading(text);
    if (!slug) {
      slug = `section-${index + 1}`;
    }

    if (slugCounts.has(slug)) {
      const count = (slugCounts.get(slug) ?? 0) + 1;
      slugCounts.set(slug, count);
      slug = `${slug}-${count}`;
    } else {
      slugCounts.set(slug, 0);
    }

    (heading as HTMLElement).setAttribute('id', slug);
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
  let cleaned = decoded.replace(/<!--[\s\S]*?-->/g, '');

  const template = document.createElement('template');
  template.innerHTML = cleaned;

  const allowedTags = new Set([
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
  ]);
  const allowedAttrs: Record<string, Set<string>> = {
    a: new Set(['href', 'title']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    span: new Set(['class']),
    div: new Set(['class']),
    td: new Set(['colspan', 'rowspan']),
    th: new Set(['colspan', 'rowspan']),
  };

  template.content.querySelectorAll('*').forEach((element) => {
    const el = element as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (!allowedTags.has(tag)) {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
      } else {
        el.remove();
      }
      return;
    }

    Array.from(el.attributes).forEach((attr) => {
      const attrName = attr.name.toLowerCase();
      const allowedForTag = allowedAttrs[tag];
      if (!allowedForTag || !allowedForTag.has(attrName)) {
        el.removeAttribute(attr.name);
        return;
      }

      if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attr.value)) {
        el.removeAttribute(attr.name);
        return;
      }
    });

    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href) {
        const isInternalLink = href.startsWith('/r/') || href.startsWith('/u/') ||
                               href.startsWith('/user/') || href.startsWith('/wiki/');

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

function formatRelativeTime(epochSeconds: number): string {
  const diffMs = epochSeconds * 1000 - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
    { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
    { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
    { unit: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
    { unit: 'day', ms: 1000 * 60 * 60 * 24 },
    { unit: 'hour', ms: 1000 * 60 * 60 },
    { unit: 'minute', ms: 1000 * 60 },
    { unit: 'second', ms: 1000 },
  ];

  for (const { unit, ms } of units) {
    if (absMs >= ms || unit === 'second') {
      const delta = Math.round(diffMs / ms);
      return rtf.format(delta, unit);
    }
  }
  return rtf.format(0, 'second');
}

function formatAbsoluteDate(epochSeconds?: number): string {
  if (!epochSeconds) {
    return '';
  }
  return new Date(epochSeconds * 1000).toLocaleString();
}

function extractRevisionMeta(data?: any, explicitId?: string): RevisionMeta | null {
  if (!data) {
    return null;
  }
  const rawAuthorName = data?.revision_by?.data?.name
    ?.replace(/^u\//i, '')
    ?.replace(/^\/+/, '')
    ?.trim();
  const author =
    data?.revision_by?.data?.display_name_prefixed?.trim() ??
    (rawAuthorName ? `u/${rawAuthorName}` : undefined);

  let timestamp: number | undefined;
  if (typeof data?.revision_date === 'number') {
    timestamp = data.revision_date;
  } else if (typeof data?.revision_date === 'string') {
    const parsed = Number(data.revision_date);
    if (!Number.isNaN(parsed)) {
      timestamp = parsed;
    }
  }

  const reason = data?.reason || 'No description provided';
  const revisionId =
    explicitId || (typeof data?.revision_id === 'string' ? data.revision_id : undefined) || undefined;
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
