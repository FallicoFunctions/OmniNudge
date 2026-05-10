/**
 * Standalone slot components — deliberately avoid all app-level context
 * (no useNavigate, no useMutation, no QueryClient) so they can be rendered
 * via ReactDOM.createRoot() without any provider wrappers.
 */
import { useState } from 'react';
import api from '../../services/api';
import type { PlatformPost } from '../../types/posts';

// ─── Join / Subscribe slot ──────────────────────────────────────────────────

interface HubJoinSlotProps {
  hubName: string;
  isSubscribed: boolean;
  userId: number | null;
}

export function HubJoinSlot({ hubName, isSubscribed: initialSubscribed, userId }: HubJoinSlotProps) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [loading, setLoading] = useState(false);

  const openAuth = () => {
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', { detail: { mode: 'login', redirectTo: `/h/${hubName}` } })
    );
  };

  const toggle = async () => {
    if (!userId) { openAuth(); return; }
    setLoading(true);
    try {
      if (subscribed) {
        await api.delete(`/hubs/${hubName}/subscription`);
        setSubscribed(false);
      } else {
        await api.post(`/hubs/${hubName}/subscription`);
        setSubscribed(true);
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
      {loading ? '…' : subscribed ? 'Leave' : 'Join'}
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
    if (!userId) {
      window.dispatchEvent(
        new CustomEvent('open-auth-modal', {
          detail: { mode: 'login', redirectTo: `/create-post?hub=${hubName}` },
        })
      );
      return;
    }
    window.location.href = `/create-post?hub=${hubName}`;
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
      onClick={() => { window.location.href = `/h/${hubName}/mod`; }}
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

interface PostCardProps { post: PlatformPost; hubName: string; }

function StandalonePostCard({ post, hubName }: PostCardProps) {
  const href = `/h/${hubName}/comments/${post.id}`;
  return (
    <div
      className="hub-slot-post-card"
      style={{ cursor: 'pointer', marginBottom: '12px' }}
      onClick={() => { window.location.href = href; }}
    >
      <div className="hub-slot-post-title" style={{ fontWeight: 600, marginBottom: '6px' }}>
        {post.title}
      </div>
      <div className="hub-slot-post-meta" style={{ fontSize: '0.85rem', display: 'flex', gap: '12px', opacity: 0.7 }}>
        <span>by {post.author_username}</span>
        <span>↑ {post.score ?? 0}</span>
        <span>💬 {post.comment_count ?? post.num_comments ?? 0}</span>
        <span>{relativeTime(post.created_at)}</span>
      </div>
    </div>
  );
}

export interface StandalonePostFeedProps {
  posts: PlatformPost[];
  loading: boolean;
  hubName: string;
}

export function StandalonePostFeed({ posts, loading, hubName }: StandalonePostFeedProps) {
  if (loading) return <p style={{ color: 'inherit', padding: '16px' }}>Loading posts…</p>;
  if (posts.length === 0) return <p style={{ color: 'inherit', padding: '16px' }}>No posts yet.</p>;
  return (
    <div className="hub-slot-post-list" style={{ display: 'flex', flexDirection: 'column' }}>
      {posts.map(post => <StandalonePostCard key={post.id} post={post} hubName={hubName} />)}
    </div>
  );
}

// ─── Feed Controls ───────────────────────────────────────────────────────────

export function HubFeedControls({ sort, onSortChange, searchValue, onSearchChange, onSearch }: HubFeedControlsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
      <div role="tablist" style={{ display: 'flex', gap: '4px' }}>
        {SORTS.map(s => (
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
      <input
        type="search"
        className="hub-slot-search"
        placeholder="Search posts…"
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSearch()}
      />
    </div>
  );
}
