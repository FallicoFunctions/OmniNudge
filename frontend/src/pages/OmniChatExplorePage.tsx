import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bookmark,
  Film,
  Flag,
  GitFork,
  Heart,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Reply,
  Share2,
  Trash2,
  UserPlus,
} from 'lucide-react';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import OmniChatMediaAssetView from '../components/omnichat/OmniChatMediaAssetView';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import type { OmniChatPublication, OmniChatPublicationKind } from '../types/omnichat';
import { omnichatQueryKeys, omnichatService } from '../services/omnichatService';
import { useAuth } from '../contexts/AuthContext';

type ExploreFilter = 'all' | OmniChatPublicationKind;

function useOmniChatNavigation() {
  const navigate = useNavigate();
  return (tab: SidebarTab) => {
    if (tab === 'discover') navigate('/omnichat');
    if (tab === 'chat') navigate('/omnichat/chat');
    if (tab === 'groups') navigate('/omnichat/groups');
    if (tab === 'create') navigate('/omnichat/create');
    if (tab === 'explore') navigate('/omnichat/explore');
    if (tab === 'characters') navigate('/omnichat/studio');
    if (tab === 'search') navigate('/omnichat?search=open');
  };
}

export function OmniChatExploreWorkspace() {
  const [filter, setFilter] = useState<ExploreFilter>('all');
  const exploreQuery = useInfiniteQuery({
    queryKey: omnichatQueryKeys.explore(filter),
    initialPageParam: undefined as { before: string; beforeId: string } | undefined,
    queryFn: ({ pageParam }) =>
      omnichatService.listExplore(
        filter === 'all' ? undefined : filter,
        pageParam?.before,
        pageParam?.beforeId,
        20
      ),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 20) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { before: last.published_at, beforeId: last.id };
    },
  });
  const publications = exploreQuery.data?.pages.flat() ?? [];

  return (
    <div className="min-h-[calc(100dvh-var(--omnichat-header-offset))] bg-[radial-gradient(circle_at_50%_0%,rgba(75,85,220,0.16),transparent_34%),var(--color-background)] px-4 py-7 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1460px]">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-300/65">
              Community stories
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Explore
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/48">
              Discover scenes and conversations created with OmniChat characters, then make the
              story your own.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5">
            {(
              [
                ['all', LayoutGrid, 'All'],
                ['image', ImageIcon, 'Images'],
                ['video', Film, 'Videos'],
                ['chat', MessageCircle, 'Chats'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition ${filter === value ? 'bg-indigo-500 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </header>

        {exploreQuery.isLoading ? (
          <div className="flex min-h-80 items-center justify-center">
            <Loader2 className="animate-spin text-indigo-300" size={32} />
          </div>
        ) : exploreQuery.isError ? (
          <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-8 text-center text-rose-100">
            Explore could not be loaded.
          </div>
        ) : publications.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-[30px] border border-dashed border-white/10 text-center text-white/40">
            <Images size={44} />
            <p className="mt-4 font-medium text-white/75">Nothing published here yet</p>
            <p className="mt-1 text-sm">Create the first scene or share a favorite chat.</p>
          </div>
        ) : (
          <div className="columns-1 gap-5 md:columns-2 xl:columns-3">
            {publications.map((publication) => (
              <OmniChatPublicationCard key={publication.id} publication={publication} />
            ))}
          </div>
        )}
        {exploreQuery.hasNextPage && (
          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={() => void exploreQuery.fetchNextPage()}
              disabled={exploreQuery.isFetchingNextPage}
              className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-medium text-white/70 hover:border-white/25 hover:text-white disabled:opacity-40"
            >
              {exploreQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OmniChatPublicationCard({
  publication,
  expanded = false,
}: {
  publication: OmniChatPublication;
  expanded?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const [actionError, setActionError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportDetails, setReportDetails] = useState('');
  const requireAuth = (action: () => void) => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/omnichat/explore/${publication.id}`)}`);
      return;
    }
    action();
  };
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['omnichat', 'explore'] });
    void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.publication(publication.id) });
  };
  const likeMutation = useMutation({
    mutationFn: (liked: boolean) => omnichatService.setPublicationLiked(publication.id, liked),
    onSuccess: invalidate,
    onError: () => setActionError('Like could not be updated.'),
  });
  const followMutation = useMutation({
    mutationFn: (following: boolean) =>
      omnichatService.setFollowing(publication.author_user_id, following),
    onSuccess: invalidate,
    onError: () => setActionError('Follow could not be updated.'),
  });
  const bookmarkMutation = useMutation({
    mutationFn: (bookmarked: boolean) =>
      omnichatService.setPublicationBookmarked(publication.id, bookmarked),
    onSuccess: invalidate,
    onError: () => setActionError('Save could not be updated.'),
  });
  const continueMutation = useMutation({
    mutationFn: () => omnichatService.continueSharedChat(publication.id),
    onSuccess: (conversation) => navigate(`/omnichat/c/${conversation.id}`),
    onError: () => setActionError('This chat could not be continued.'),
  });
  const reportMutation = useMutation({
    mutationFn: () =>
      omnichatService.reportPublication(publication.id, 'other', reportDetails.trim()),
    onSuccess: () => {
      setShowReport(false);
      setReportDetails('');
      setActionError('Report submitted.');
    },
    onError: () => setActionError('Report could not be submitted.'),
  });
  const removeMutation = useMutation({
    mutationFn: () => omnichatService.removePublication(publication.id),
    onSuccess: () => {
      invalidate();
      navigate('/omnichat/explore');
    },
    onError: () => setActionError('Publication could not be removed.'),
  });
  const share = async () => {
    const path = isAuthenticated
      ? await omnichatService.recordPublicationShare(publication.id)
      : `/omnichat/explore/${publication.id}`;
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share)
      await navigator.share({
        title: publication.snapshot?.title || `${publication.persona_name} on OmniChat`,
        url,
      });
    else await navigator.clipboard.writeText(url);
    invalidate();
  };

  return (
    <article
      className={`mb-5 break-inside-avoid overflow-hidden rounded-[28px] border border-white/10 bg-[#15161d]/92 shadow-xl shadow-black/15 ${expanded ? 'mx-auto max-w-4xl' : ''}`}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-400/30 to-blue-500/20 text-sm font-semibold text-white">
          {publication.author.avatar_url ? (
            <img
              src={publication.author.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            publication.author.username.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            @{publication.author.username}
          </p>
          <p className="truncate text-xs text-white/38">with {publication.persona_name}</p>
        </div>
        {isAuthenticated && user?.id !== publication.author_user_id && (
          <button
            type="button"
            onClick={() => followMutation.mutate(!publication.viewer_following)}
            className="flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white"
          >
            <UserPlus size={13} />
            {publication.viewer_following ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      {publication.asset && (
        <OmniChatMediaAssetView
          asset={publication.asset}
          className={`${expanded ? 'max-h-[70vh]' : 'aspect-[4/5] max-h-[680px]'} min-h-64 w-full rounded-none`}
        />
      )}
      {publication.snapshot && (
        <button
          type="button"
          onClick={() => !expanded && navigate(`/omnichat/explore/${publication.id}`)}
          className="block w-full bg-[radial-gradient(circle_at_0%_0%,rgba(99,102,241,0.2),transparent_48%),rgba(255,255,255,0.025)] px-5 py-7 text-left"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-200">
            <MessageCircle size={12} /> Shared chat
          </span>
          <h2 className="mt-4 text-xl font-semibold text-white">{publication.snapshot.title}</h2>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/58">
            {publication.snapshot.excerpt}
          </p>
          <p className="mt-4 text-xs text-white/32">
            {publication.snapshot.message_count} messages · {publication.remix_count} continuations
          </p>
        </button>
      )}

      <div className="p-4">
        {publication.caption && (
          <p className="mb-4 text-sm leading-6 text-white/70">
            <span className="mr-2 font-semibold text-white">@{publication.author.username}</span>
            {publication.caption}
          </p>
        )}
        <div className="flex items-center gap-1 text-white/55">
          <button
            aria-label={`Like ${publication.like_count}`}
            type="button"
            onClick={() => requireAuth(() => likeMutation.mutate(!publication.viewer_liked))}
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs hover:bg-white/5 ${publication.viewer_liked ? 'text-rose-300' : ''}`}
          >
            <Heart size={17} fill={publication.viewer_liked ? 'currentColor' : 'none'} />{' '}
            {publication.like_count}
          </button>
          <button
            aria-label={`Comments ${publication.comment_count}`}
            type="button"
            onClick={() => navigate(`/omnichat/explore/${publication.id}`)}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs hover:bg-white/5"
          >
            <MessageCircle size={17} /> {publication.comment_count}
          </button>
          <button
            aria-label={`Share ${publication.share_count}`}
            type="button"
            onClick={() =>
              void share().catch(() => setActionError('Share could not be completed.'))
            }
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs hover:bg-white/5"
          >
            <Share2 size={17} /> {publication.share_count}
          </button>
          <button
            aria-label="Save"
            type="button"
            onClick={() =>
              requireAuth(() => bookmarkMutation.mutate(!publication.viewer_bookmarked))
            }
            className={`ml-auto rounded-full p-2 hover:bg-white/5 ${publication.viewer_bookmarked ? 'text-amber-300' : ''}`}
          >
            <Bookmark size={17} fill={publication.viewer_bookmarked ? 'currentColor' : 'none'} />
          </button>
          {isAuthenticated && user?.id !== publication.author_user_id && (
            <button
              aria-label="Report publication"
              type="button"
              onClick={() => setShowReport((visible) => !visible)}
              className="rounded-full p-2 hover:bg-white/5 hover:text-rose-300"
            >
              <Flag size={17} />
            </button>
          )}
          {isAuthenticated && user?.id === publication.author_user_id && (
            <button
              aria-label="Unpublish"
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="rounded-full p-2 hover:bg-white/5 hover:text-rose-300 disabled:opacity-40"
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
        {showReport && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              reportMutation.mutate();
            }}
            className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3"
          >
            <label className="text-xs text-white/55">
              Why are you reporting this? (optional)
              <textarea
                aria-label="Report details"
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                maxLength={1000}
                className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={reportMutation.isPending}
              className="mt-2 rounded-xl bg-rose-500/80 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              {reportMutation.isPending ? 'Submitting…' : 'Submit report'}
            </button>
          </form>
        )}
        {publication.content_kind === 'chat' && (
          <button
            type="button"
            onClick={() => requireAuth(() => continueMutation.mutate())}
            disabled={continueMutation.isPending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-45"
          >
            {continueMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <GitFork size={16} />
            )}{' '}
            Continue this chat
          </button>
        )}
        {actionError && <p className="mt-2 text-xs text-rose-300">{actionError}</p>}
      </div>
    </article>
  );
}

function PublicationConversation({ publication }: { publication: OmniChatPublication }) {
  const messages = publication.snapshot?.messages ?? [];
  if (messages.length === 0) return null;
  return (
    <div className="mx-auto mb-5 max-w-4xl space-y-3 rounded-[28px] border border-white/10 bg-[#111218] p-5 sm:p-7">
      {messages.map((message) => (
        <div
          key={message.position}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[86%] rounded-3xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-white/[0.07] text-white/80'}`}
          >
            <p>{message.content}</p>
            {message.attachments?.map((asset) => (
              <OmniChatMediaAssetView
                key={asset.id}
                asset={asset}
                className="mt-3 max-h-[32rem] min-h-52 w-full"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PublicationComments({ publicationId }: { publicationId: string }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [parentId, setParentId] = useState<string>();
  const [replyingTo, setReplyingTo] = useState('');
  const commentsQuery = useInfiniteQuery({
    queryKey: omnichatQueryKeys.publicationComments(publicationId),
    initialPageParam: undefined as { after: string; afterId: string } | undefined,
    queryFn: ({ pageParam }) =>
      omnichatService.listPublicationComments(
        publicationId,
        pageParam?.after,
        pageParam?.afterId,
        50
      ),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 50) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { after: last.created_at, afterId: last.id };
    },
  });
  const comments = commentsQuery.data?.pages.flat() ?? [];
  const addMutation = useMutation({
    mutationFn: ({ comment, replyTo }: { comment: string; replyTo?: string }) =>
      omnichatService.addPublicationComment(publicationId, comment, replyTo),
    onSuccess: () => {
      setBody('');
      setParentId(undefined);
      setReplyingTo('');
      void queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.publicationComments(publicationId),
      });
      void queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.publication(publicationId),
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: omnichatService.deletePublicationComment,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.publicationComments(publicationId),
      });
      void queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.publication(publicationId),
      });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (body.trim()) addMutation.mutate({ comment: body.trim(), replyTo: parentId });
  };
  return (
    <section className="mx-auto max-w-4xl rounded-[28px] border border-white/10 bg-[#15161d] p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-white">Comments</h2>
      {isAuthenticated && (
        <>
          {replyingTo && (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/50">
              Replying to @{replyingTo}
              <button
                type="button"
                onClick={() => {
                  setParentId(undefined);
                  setReplyingTo('');
                }}
                className="text-white/70"
              >
                Cancel
              </button>
            </div>
          )}
          <form onSubmit={submit} className="mt-4 flex gap-2">
            <input
              aria-label="Add a comment"
              value={body}
              maxLength={2000}
              onChange={(event) => setBody(event.target.value)}
              placeholder={replyingTo ? `Reply to @${replyingTo}…` : 'Join the conversation…'}
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
            />
            <button
              disabled={!body.trim() || addMutation.isPending}
              className="rounded-2xl bg-indigo-500 px-5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {addMutation.isPending ? 'Posting…' : 'Post'}
            </button>
          </form>
          {addMutation.isError && (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              Your comment could not be posted.
            </p>
          )}
        </>
      )}
      {!isAuthenticated && (
        <p className="mt-4 text-sm text-white/45">
          <Link
            to={`/login?redirect=${encodeURIComponent(`/omnichat/explore/${publicationId}`)}`}
            className="text-indigo-300"
          >
            Sign in
          </Link>{' '}
          to join the comments.
        </p>
      )}
      <div className="mt-5 space-y-4">
        {commentsQuery.isLoading && <Loader2 className="animate-spin text-indigo-300" />}
        {commentsQuery.isError && (
          <p role="alert" className="text-sm text-rose-300">
            Comments could not be loaded.
          </p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="border-t border-white/8 pt-4">
            <p className="text-xs font-semibold text-white/70">@{comment.author.username}</p>
            <p className="mt-1 text-sm leading-6 text-white/65">{comment.body}</p>
            {isAuthenticated && (
              <div className="mt-2 flex gap-3 text-xs text-white/35">
                <button
                  type="button"
                  onClick={() => {
                    setParentId(comment.id);
                    setReplyingTo(comment.author.username);
                  }}
                  className="flex items-center gap-1 hover:text-white"
                >
                  <Reply size={12} /> Reply
                </button>
                {user?.id === comment.author_user_id && (
                  <button
                    type="button"
                    aria-label="Delete comment"
                    onClick={() => deleteMutation.mutate(comment.id)}
                    disabled={deleteMutation.isPending}
                    className="flex items-center gap-1 hover:text-rose-300 disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {!commentsQuery.isLoading && !commentsQuery.isError && comments.length === 0 && (
          <p className="text-sm text-white/35">No comments yet.</p>
        )}
        {commentsQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => void commentsQuery.fetchNextPage()}
            disabled={commentsQuery.isFetchingNextPage}
            className="w-full rounded-xl border border-white/10 px-4 py-2 text-sm text-white/55 hover:text-white disabled:opacity-40"
          >
            {commentsQuery.isFetchingNextPage ? 'Loading…' : 'Load more comments'}
          </button>
        )}
      </div>
    </section>
  );
}

export function OmniChatPublicationWorkspace() {
  const { publicationId = '' } = useParams();
  const publicationQuery = useQuery({
    queryKey: omnichatQueryKeys.publication(publicationId),
    queryFn: () => omnichatService.getPublication(publicationId),
    enabled: Boolean(publicationId),
  });
  if (publicationQuery.isLoading)
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="animate-spin text-indigo-300" />
      </div>
    );
  if (publicationQuery.isError)
    return (
      <div role="alert" className="p-10 text-center text-rose-300">
        Publication could not be loaded.
      </div>
    );
  if (!publicationQuery.data)
    return <div className="p-10 text-center text-white/50">Publication not found.</div>;
  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-7">
      <OmniChatPublicationCard publication={publicationQuery.data} expanded />
      <PublicationConversation publication={publicationQuery.data} />
      <PublicationComments publicationId={publicationQuery.data.id} />
    </div>
  );
}

export default function OmniChatExplorePage() {
  return (
    <OmniChatShell activeTab="explore" onTabChange={useOmniChatNavigation()}>
      <OmniChatExploreWorkspace />
    </OmniChatShell>
  );
}

export function OmniChatPublicationPage() {
  return (
    <OmniChatShell activeTab="explore" onTabChange={useOmniChatNavigation()}>
      <OmniChatPublicationWorkspace />
    </OmniChatShell>
  );
}
