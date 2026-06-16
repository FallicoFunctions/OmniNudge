/**
 * Standalone slot components — deliberately avoid all app-level context
 * (no useNavigate, no useMutation, no QueryClient) so they stay easy to mount
 * inside AI-authored layouts without depending on additional wrapper trees.
 */
import { useEffect, useState } from 'react';
import { subscriptionService } from '../../services/subscriptionService';

// ─── Join / Subscribe slot ──────────────────────────────────────────────────

interface HubJoinSlotProps {
  hubName: string;
  isSubscribed: boolean;
  userId: number | null;
}

export function HubJoinSlot({
  hubName,
  isSubscribed: initialSubscribed,
  userId,
}: HubJoinSlotProps) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSubscribed(initialSubscribed);
  }, [initialSubscribed]);

  const openAuth = () => {
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', { detail: { mode: 'login', redirectTo: `/h/${hubName}` } })
    );
  };

  const toggle = async () => {
    if (!userId) {
      openAuth();
      return;
    }
    setLoading(true);
    try {
      if (subscribed) {
        const data = await subscriptionService.unsubscribeFromHub(hubName);
        setSubscribed(data.is_subscribed);
      } else {
        const data = await subscriptionService.subscribeToHub(hubName);
        setSubscribed(data.is_subscribed);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className={`hub-slot-btn ${subscribed ? 'hub-slot-btn--secondary' : 'hub-slot-btn--primary'}`}
      onClick={toggle}
      disabled={loading}
    >
      {loading ? '…' : subscribed ? 'Unsubscribe' : 'Join'}
    </button>
  );
}

// ─── Create Post slot ───────────────────────────────────────────────────────

interface HubCreateSlotProps {
  hubName: string;
  userId: number | null;
}

export function HubCreateSlot({ hubName, userId }: HubCreateSlotProps) {
  const handle = () => {
    const destination = `/posts/create?hub=${encodeURIComponent(hubName)}`;
    if (!userId) {
      window.dispatchEvent(
        new CustomEvent('open-auth-modal', {
          detail: { mode: 'login', redirectTo: destination },
        })
      );
      return;
    }
    window.location.assign(destination);
  };

  return (
    <button className="hub-slot-btn hub-slot-btn--create" onClick={handle}>
      + Create Post
    </button>
  );
}

// ─── Mod Tools slot ─────────────────────────────────────────────────────────

interface HubModSlotProps {
  hubName: string;
  isModerator: boolean;
}

export function HubModSlot({ hubName, isModerator }: HubModSlotProps) {
  if (!isModerator) return null;
  return (
    <button
      className="hub-slot-btn hub-slot-btn--mod"
      onClick={() => {
        window.location.href = `/h/${hubName}/mod`;
      }}
    >
      Mod Tools
    </button>
  );
}

// ─── Feed Controls ──────────────────────────────────────────────────────────

export type SortOption = 'hot' | 'new' | 'top' | 'rising';

interface HubFeedControlsProps {
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSearch: () => void;
}

const SORTS: { value: SortOption; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
  { value: 'rising', label: 'Rising' },
];

// ─── Standalone Post Card ────────────────────────────────────────────────────

export interface FeedSlotPost {
  id: number;
  title: string;
  author_username?: string | null;
  author?: {
    username?: string | null;
  } | null;
  score?: number | null;
  comment_count?: number | null;
  num_comments?: number | null;
  created_at: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface PostCardProps {
  post: FeedSlotPost;
  hubName: string;
}

function StandalonePostCard({ post, hubName }: PostCardProps) {
  const href = `/h/${hubName}/comments/${post.id}`;
  const authorName = post.author_username ?? post.author?.username ?? 'unknown';
  return (
    <div
      className="hub-slot-post-card"
      style={{ cursor: 'pointer', marginBottom: '12px' }}
      onClick={() => {
        window.location.href = href;
      }}
    >
      <div className="hub-slot-post-title" style={{ fontWeight: 600, marginBottom: '6px' }}>
        {post.title}
      </div>
      <div
        className="hub-slot-post-meta"
        style={{ fontSize: '0.85rem', display: 'flex', gap: '12px', opacity: 0.7 }}
      >
        <span>by {authorName}</span>
        <span>↑ {post.score ?? 0}</span>
        <span>💬 {post.comment_count ?? post.num_comments ?? 0}</span>
        <span>{relativeTime(post.created_at)}</span>
      </div>
    </div>
  );
}

export interface StandalonePostFeedProps {
  posts: FeedSlotPost[];
  loading: boolean;
  hubName: string;
}

export function StandalonePostFeed({ posts, loading, hubName }: StandalonePostFeedProps) {
  if (loading)
    return (
      <p className="hub-slot-feed-empty" style={{ color: 'inherit', padding: '16px' }}>
        Loading posts…
      </p>
    );
  if (posts.length === 0)
    return (
      <p className="hub-slot-feed-empty" style={{ color: 'inherit', padding: '16px' }}>
        No posts yet.
      </p>
    );
  return (
    <div
      className="hub-slot-feed-list hub-slot-post-list"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {posts.map((post) => (
        <StandalonePostCard key={post.id} post={post} hubName={hubName} />
      ))}
    </div>
  );
}

// ─── Feed Controls ───────────────────────────────────────────────────────────

export function HubFeedControls({
  sort,
  onSortChange,
  searchValue,
  onSearchChange,
  onSearch,
}: HubFeedControlsProps) {
  return (
    <div
      className="hub-slot-feed-controls"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        marginBottom: '16px',
      }}
    >
      <div className="hub-slot-feed-tabs" role="tablist" style={{ display: 'flex', gap: '4px' }}>
        {SORTS.map((s) => (
          <button
            key={s.value}
            role="tab"
            aria-selected={sort === s.value}
            className={`hub-slot-tab${sort === s.value ? ' hub-slot-tab--active' : ''}`}
            onClick={() => onSortChange(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="hub-slot-feed-search-wrap">
        <input
          type="search"
          className="hub-slot-search"
          placeholder="Search posts…"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        />
      </div>
    </div>
  );
}
