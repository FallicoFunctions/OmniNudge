import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { siteWideSearch } from '../services/searchService';
import { useRedditBlocklist } from '../contexts/RedditBlockContext';
import { formatTimestamp } from '../utils/timeFormat';
import { RedditPostCard } from '../components/reddit/RedditPostCard';
import { VoteButtons } from '../components/VoteButtons';

type Tab = 'posts' | 'communities' | 'users';
type PostSource = 'all' | 'omni';
type SortOrder = 'relevance' | 'new' | 'old';

export default function SearchResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const initialQuery = params.get('q') ?? '';
  const initialSort = (params.get('sort') as SortOrder) ?? 'relevance';
  const initialTab = (params.get('tab') as Tab) ?? 'posts';
  const initialIncludeNsfwParam = params.get('include_nsfw') === 'true';
  const { searchIncludeNsfwByDefault, blockAllNsfw } = useSettings();
  const { blockedUsers } = useRedditBlocklist();

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<SortOrder>(initialSort);
  const [includeNsfw, setIncludeNsfw] = useState(
    !blockAllNsfw && (initialIncludeNsfwParam || searchIncludeNsfwByDefault)
  );
  const [postSource, setPostSource] = useState<PostSource>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [posts, setPosts] = useState<{
    reddit: any[];
    platform: any[];
    redditAfter: string | null;
    redditAfterStack: (string | null)[];
    platformOffset: number;
    hasMoreReddit: boolean;
    hasMorePlatform: boolean;
    page: number;
  }>({
    reddit: [],
    platform: [],
    redditAfter: null,
    redditAfterStack: [null],
    platformOffset: 0,
    hasMoreReddit: false,
    hasMorePlatform: false,
    page: 1,
  });
  const [communities, setCommunities] = useState<{
    subreddits: any[];
    hubs: any[];
    hubsOffset: number;
    hasMoreHubs: boolean;
  }>({
    subreddits: [],
    hubs: [],
    hubsOffset: 0,
    hasMoreHubs: false,
  });
  const [users, setUsers] = useState<{
    reddit: any[];
    omni: any[];
    redditAfter: string | null;
    omniOffset: number;
    hasMoreReddit: boolean;
    hasMoreOmni: boolean;
  }>({
    reddit: [],
    omni: [],
    redditAfter: null,
    omniOffset: 0,
    hasMoreReddit: false,
    hasMoreOmni: false,
  });

  const handleSearch = async (
    q: string,
    opts?: { tab?: Tab; sort?: SortOrder; page?: number }
  ) => {
    if (!q.trim()) return;
    setIsLoading(true);
    try {
      const targetPage = opts?.page ?? posts.page;
      const redditAfter =
        targetPage > 1 ? posts.redditAfterStack[targetPage - 2] ?? null : null;
      const platformOffset = (targetPage - 1) * 25;
      const hubsOffset = communities.hubsOffset && targetPage > 1 ? (targetPage - 1) * 25 : 0;
      const omniOffset = users.omniOffset && targetPage > 1 ? (targetPage - 1) * 25 : 0;

      const res = await siteWideSearch(q, includeNsfw, {
        sort: opts?.sort ?? sort,
        redditAfter,
        platformOffset,
        hubsOffset,
        omniUsersOffset: omniOffset,
      });

      const nextAfterStack = [...posts.redditAfterStack];
      nextAfterStack[targetPage - 1] = res.posts.redditAfter ?? null;
      setPosts({
        reddit: res.posts.reddit ?? [],
        platform: res.posts.platform ?? [],
        redditAfter: res.posts.redditAfter ?? null,
        redditAfterStack: nextAfterStack,
        platformOffset: res.posts.platformOffset ?? platformOffset,
        hasMoreReddit: Boolean(res.posts.redditAfter),
        hasMorePlatform: (res.posts.platform?.length ?? 0) >= 25,
        page: targetPage,
      });
      setCommunities({
        subreddits: res.subreddits ?? [],
        hubs: res.hubs ?? [],
        hubsOffset: res.hubsOffset ?? 0,
        hasMoreHubs: (res.hubs?.length ?? 0) >= 25,
      });
      setUsers({
        reddit: res.users.reddit ?? [],
        omni: res.users.omni ?? [],
        redditAfter: res.users.redditAfter ?? null,
        omniOffset: res.users.omniOffset ?? 0,
        hasMoreReddit: Boolean(res.users.redditAfter),
        hasMoreOmni: (res.users.omni?.length ?? 0) >= 25,
      });
      const nextParams = new URLSearchParams(location.search);
      nextParams.set('q', q);
      nextParams.set('tab', opts?.tab ?? activeTab);
      nextParams.set('sort', opts?.sort ?? sort);
      nextParams.set('include_nsfw', includeNsfw ? 'true' : 'false');
      navigate(`/search?${nextParams.toString()}`, { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery, { tab: initialTab, sort: initialSort });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query) {
      handleSearch(query, { tab: activeTab, sort, append: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeNsfw]);

  const filteredPosts = useMemo(() => {
    const reddit = posts.reddit ?? [];
    const omni = posts.platform ?? [];

    const mappedOmni = omni.map((post) => ({
      type: 'platform' as const,
      post,
    }));
    const mappedReddit = reddit.map((post) => ({
      type: 'reddit' as const,
      post,
    }));

    const merged = postSource === 'omni' ? mappedOmni : [...mappedReddit, ...mappedOmni];

    return merged;
  }, [posts, postSource]);

  const filteredSubreddits = useMemo(() => communities.subreddits ?? [], [communities]);
  const filteredHubs = useMemo(() => communities.hubs ?? [], [communities]);
  const filteredRedditUsers = useMemo(() => users.reddit ?? [], [users]);
  const filteredOmniUsers = useMemo(() => users.omni ?? [], [users]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-left">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Search</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Site-wide results across Reddit and Omni
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(query);
              }
            }}
            placeholder="Search..."
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <button
            type="button"
            onClick={() => handleSearch(query)}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
          >
            Search
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              activeTab === 'posts'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
            }`}
            onClick={() => {
              setActiveTab('posts');
              handleSearch(query, { tab: 'posts' });
            }}
          >
            Posts
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              activeTab === 'communities'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
            }`}
            onClick={() => {
              setActiveTab('communities');
              handleSearch(query, { tab: 'communities' });
            }}
          >
            Communities
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              activeTab === 'users'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
            }`}
            onClick={() => {
              setActiveTab('users');
              handleSearch(query, { tab: 'users' });
            }}
          >
            Users
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Sort</label>
          {(['relevance', 'new', 'old'] as const).map((opt) => (
            <button
              key={opt}
              className={`rounded-md px-3 py-1 text-sm ${
                sort === opt
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
              }`}
              onClick={() => {
                setSort(opt);
                handleSearch(query, { sort: opt });
              }}
            >
              {opt === 'relevance' ? 'Relevance' : opt === 'new' ? 'Newest' : 'Oldest'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Omni only</label>
          <button
            type="button"
            role="switch"
            aria-checked={postSource === 'omni'}
            onClick={() => setPostSource(postSource === 'omni' ? 'all' : 'omni')}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
              postSource === 'omni' ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
            }`}
          >
            <span className="sr-only">Omni only</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                postSource === 'omni' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {!blockAllNsfw && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Include NSFW</label>
            <button
              type="button"
              role="switch"
              aria-checked={includeNsfw}
              onClick={() => setIncludeNsfw(!includeNsfw)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                includeNsfw ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">Include NSFW</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  includeNsfw ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {isLoading && <div className="text-sm text-[var(--color-text-secondary)]">Loading...</div>}

      {!isLoading && activeTab === 'posts' && (
        <div className="space-y-3">
          {filteredPosts.length === 0 && (
            <div className="text-sm text-[var(--color-text-secondary)]">No posts found</div>
          )}
          {filteredPosts.map((item, idx) => {
            if (item.type === 'reddit') {
              return (
                <RedditPostCard
                  key={`sr-reddit-${item.post.id}-${idx}`}
                  post={item.post}
                  useRelativeTime
                  isSaved={false}
                  isSaveActionPending={false}
                  pendingShouldSave={undefined}
                  onShare={() => {}}
                  onToggleSave={() => {}}
                  onHide={() => {}}
                  onCrosspost={() => {}}
                />
              );
            }
            const post = item.post;
            const previewImage = post.thumbnail_url || post.media_url;
            const displayAuthor =
              post.author_username ||
              post.author?.username ||
              (post.author_id === undefined ? undefined : String(post.author_id));
            const createdTimestamp = post.crossposted_at ?? post.created_at;
            const createdLabel = createdTimestamp ? formatTimestamp(createdTimestamp, true) : 'unknown time';
            const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
            const pointsLabel = `${post.score.toLocaleString()} points`;
            const postUrl = `/posts/${post.id}`;
            const isBlockedAuthor = displayAuthor ? blockedUsers.has(displayAuthor.toLowerCase()) : false;
            if (isBlockedAuthor) return null;

            return (
              <article
                key={`sr-local-${post.id}-${idx}`}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <div className="flex gap-3 p-3">
                  <VoteButtons
                    postId={post.id}
                    initialScore={post.score}
                    initialUserVote={post.user_vote ?? null}
                    layout="vertical"
                    size="small"
                  />
                  {previewImage && (
                    <img
                      src={previewImage}
                      alt=""
                      className="h-16 w-16 flex-shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 text-left">
                    <div className="mb-1 inline-flex items-center gap-2">
                      <span className="inline-block rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Omni
                      </span>
                    </div>
                    <a href={postUrl}>
                      <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                        {post.title}
                      </h3>
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                      <span>u/{displayAuthor ?? 'unknown'}</span>
                      <span>•</span>
                      <span>{pointsLabel}</span>
                      <span>•</span>
                      <span>submitted {createdLabel}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
                      <a
                        href={postUrl}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        {commentLabel}
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => handleSearch(query, { page: Math.max(1, posts.page - 1), tab: activeTab, sort })}
              disabled={posts.page <= 1}
              className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-sm text-[var(--color-text-secondary)]">Page {posts.page}</span>
            <button
              type="button"
              onClick={() => handleSearch(query, { page: posts.page + 1, tab: activeTab, sort })}
              disabled={!posts.hasMoreReddit && !posts.hasMorePlatform}
              className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {!isLoading && activeTab === 'communities' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Subreddits</h3>
            {filteredSubreddits.length === 0 ? (
              <div className="text-sm text-[var(--color-text-secondary)]">No subreddits found</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredSubreddits.map((sr) => (
                  <li key={sr.name} className="rounded border border-[var(--color-border)] p-3">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                      r/{sr.name}
                    </div>
                    {sr.title && (
                      <div className="text-xs text-[var(--color-text-secondary)]">{sr.title}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Hubs</h3>
            {filteredHubs.length === 0 ? (
              <div className="text-sm text-[var(--color-text-secondary)]">No hubs found</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredHubs.map((hub) => (
                  <li key={hub.id} className="rounded border border-[var(--color-border)] p-3">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {hub.name}
                    </div>
                    {hub.title && (
                      <div className="text-xs text-[var(--color-text-secondary)]">{hub.title}</div>
                    )}
                    {hub.description && (
                      <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        {hub.description}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {communities.hasMoreHubs && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSearch(query, { append: true, tab: 'communities', sort })
                  }
                  className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Load more hubs
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!isLoading && activeTab === 'users' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Reddit users</h3>
            {filteredRedditUsers.length === 0 ? (
              <div className="text-sm text-[var(--color-text-secondary)]">No Reddit users found</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredRedditUsers.map((user, idx) => (
                  <li key={`${user.name}-${idx}`} className="rounded border border-[var(--color-border)] p-3">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                      u/{user.name}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {users.hasMoreReddit && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSearch(query, { append: true, tab: 'users', sort })
                  }
                  className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Load more Reddit users
                </button>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Omni users</h3>
            {filteredOmniUsers.length === 0 ? (
              <div className="text-sm text-[var(--color-text-secondary)]">No Omni users found</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredOmniUsers.map((user) => (
                  <li key={user.username} className="rounded border border-[var(--color-border)] p-3">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {user.username}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {users.hasMoreOmni && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSearch(query, { append: true, tab: 'users', sort })
                  }
                  className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Load more users
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
