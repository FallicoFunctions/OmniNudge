import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { moderationService } from '../services/moderationService';
import { accessRequestService, type AccessRequest } from '../services/accessRequestService';
import { EmptyMessage, LoadingMessage } from '../components/common/StatusMessage';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { modMailService } from '../services/modMailService';
import type {
  HubBan,
  CreateBanRequest,
  RemovalReason,
  CreateRemovalReasonRequest,
  ModLog,
} from '../types/moderation';
import type { ModMailConversation } from '../types/modmail';

type TabType = 'bans' | 'removal_reasons' | 'mod_log' | 'mod_mail' | 'requests';

export default function ModToolsPage() {
  const { hubName } = useParams<{ hubName: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('bans');

  if (!hubName) {
    navigate('/');
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Mod Tools - h/{hubName}</h1>
          <p className="text-[var(--color-text-secondary)] mt-2">
            Manage users, content, and moderation settings
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate(`/h/${hubName}`)}
            className="px-4 py-2 rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)] transition-colors"
          >
            Exit
          </button>
          <button
            onClick={() => navigate(`/h/${hubName}/settings`)}
            className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] transition-colors"
          >
            Hub Settings
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('bans')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'bans'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            User Bans
          </button>
          <button
            onClick={() => setActiveTab('removal_reasons')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'removal_reasons'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            Removal Reasons
          </button>
          <button
            onClick={() => setActiveTab('mod_log')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'mod_log'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            Mod Log
          </button>
          <button
            onClick={() => setActiveTab('mod_mail')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'mod_mail'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            Mod Mail
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'requests'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            Requests
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'bans' && <BansTab hubName={hubName} />}
      {activeTab === 'removal_reasons' && <RemovalReasonsTab hubName={hubName} />}
      {activeTab === 'mod_log' && <ModLogTab hubName={hubName} />}
      {activeTab === 'mod_mail' && <ModMailTab hubName={hubName} />}
      {activeTab === 'requests' && <AccessRequestsTab hubName={hubName} />}
    </div>
  );
}

// ===== BANS TAB =====

function BansTab({ hubName }: { hubName: string }) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: bans, isLoading } = useQuery({
    queryKey: ['bannedUsers', hubName],
    queryFn: () => moderationService.getBannedUsers(hubName),
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: number) => moderationService.unbanUser(hubName, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedUsers', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>Loading...</LoadingMessage>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Banned Users</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90"
        >
          {showAddForm ? 'Cancel' : 'Ban User'}
        </button>
      </div>

      {showAddForm && (
        <AddBanForm
          hubName={hubName}
          onSuccess={() => {
            setShowAddForm(false);
            queryClient.invalidateQueries({ queryKey: ['bannedUsers', hubName] });
          }}
        />
      )}

      {bans && bans.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-surface-elevated)] mb-4">
            <svg className="w-8 h-8 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No banned users</h3>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto mb-4">
            Users you ban from this hub will appear here. Banned users cannot view or participate in your hub.
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Use the "Ban User" button above to ban a user by username.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {bans?.map((ban: HubBan) => (
          <div
            key={ban.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{ban.username || `User #${ban.user_id}`}</div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  {ban.reason || 'No reason provided'}
                </div>
                {ban.note && (
                  <div className="text-xs text-[var(--color-text-secondary)] mt-1 italic">
                    Mod note: {ban.note}
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-secondary)] mt-2">
                  {ban.ban_type === 'permanent' ? (
                    <span className="text-red-600 font-medium">Permanent ban</span>
                  ) : (
                    <span>
                      Temporary until {new Date(ban.expires_at!).toLocaleString()}
                    </span>
                  )}
                  {' • '}
                  Banned by {ban.banned_by_name || `#${ban.banned_by}`} on{' '}
                  {new Date(ban.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => unbanMutation.mutate(ban.user_id)}
                disabled={unbanMutation.isPending}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Unban
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddBanForm({ hubName, onSuccess }: { hubName: string; onSuccess: () => void }) {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [banType, setBanType] = useState<'permanent' | 'temporary'>('permanent');
  const [expiresAt, setExpiresAt] = useState('');

  const banMutation = useMutation({
    mutationFn: (data: CreateBanRequest) => moderationService.banUser(hubName, data),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      alert('Invalid user ID');
      return;
    }

    if (banType === 'temporary' && !expiresAt) {
      alert('Expiration date required for temporary bans');
      return;
    }

    banMutation.mutate({
      user_id: userIdNum,
      reason: reason || undefined,
      note: note || undefined,
      ban_type: banType,
      expires_at: banType === 'temporary' ? expiresAt : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
      <h3 className="font-medium mb-4">Ban User</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            User ID <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ban Type</label>
          <select
            value={banType}
            onChange={(e) => setBanType(e.target.value as 'permanent' | 'temporary')}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
          >
            <option value="permanent">Permanent</option>
            <option value="temporary">Temporary</option>
          </select>
        </div>

        {banType === 'temporary' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Expires At <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
              required={banType === 'temporary'}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Reason (visible to user)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            rows={2}
            placeholder="Optional public reason for the ban"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Mod Note (private)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            rows={2}
            placeholder="Optional private note for mod team"
          />
        </div>

        <button
          type="submit"
          disabled={banMutation.isPending}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {banMutation.isPending ? 'Banning...' : 'Ban User'}
        </button>
      </div>
    </form>
  );
}

// ===== REMOVAL REASONS TAB =====

function RemovalReasonsTab({ hubName }: { hubName: string }) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingReason, setEditingReason] = useState<RemovalReason | null>(null);

  const { data: reasons, isLoading } = useQuery({
    queryKey: ['removalReasons', hubName],
    queryFn: () => moderationService.getRemovalReasons(hubName),
  });

  const deleteMutation = useMutation({
    mutationFn: (reasonId: number) => moderationService.deleteRemovalReason(reasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['removalReasons', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>Loading...</LoadingMessage>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Removal Reason Templates</h2>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setEditingReason(null);
          }}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90"
        >
          {showAddForm ? 'Cancel' : 'Add Template'}
        </button>
      </div>

      {(showAddForm || editingReason) && (
        <RemovalReasonForm
          hubName={hubName}
          reason={editingReason}
          onSuccess={() => {
            setShowAddForm(false);
            setEditingReason(null);
            queryClient.invalidateQueries({ queryKey: ['removalReasons', hubName] });
          }}
          onCancel={() => {
            setShowAddForm(false);
            setEditingReason(null);
          }}
        />
      )}

      {reasons && reasons.length === 0 && (
        <div className="text-center py-12">
          <EmptyMessage>No removal reason templates.</EmptyMessage>
        </div>
      )}

      <div className="space-y-3">
        {reasons?.map((reason: RemovalReason) => (
          <div
            key={reason.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium">{reason.title}</div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  {reason.message}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)] mt-2">
                  Last updated {new Date(reason.updated_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setEditingReason(reason)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this removal reason?')) {
                      deleteMutation.mutate(reason.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RemovalReasonForm({
  hubName,
  reason,
  onSuccess,
  onCancel,
}: {
  hubName: string;
  reason: RemovalReason | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(reason?.title || '');
  const [message, setMessage] = useState(reason?.message || '');

  const createMutation = useMutation({
    mutationFn: (data: CreateRemovalReasonRequest) =>
      moderationService.createRemovalReason(hubName, data),
    onSuccess,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; title: string; message: string }) =>
      moderationService.updateRemovalReason(data.id, { title: data.title, message: data.message }),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (reason) {
      updateMutation.mutate({ id: reason.id, title, message });
    } else {
      createMutation.mutate({ title, message });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
      <h3 className="font-medium mb-4">{reason ? 'Edit' : 'Create'} Removal Reason</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            maxLength={100}
            required
            placeholder="e.g., Spam"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            rows={3}
            required
            placeholder="Message shown to user when content is removed"
          />
        </div>

        <div className="flex space-x-2">
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="flex-1 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-elevated)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ===== MOD LOG TAB =====

function ModLogTab({ hubName }: { hubName: string }) {
  const [cursorStack, setCursorStack] = useState(['']);
  const limit = 50;
  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';

  useEffect(() => {
    setCursorStack(['']);
  }, [hubName]);

  const { data, isLoading } = useQuery({
    queryKey: ['modLog', hubName, currentCursor],
    queryFn: () => moderationService.getModLog(hubName, limit, 0, currentCursor),
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>Loading...</LoadingMessage>
      </div>
    );
  }

  const logs = data?.logs || [];
  const hasMore = Boolean(data?.next_cursor) || logs.length >= limit;
  const hasPrev = cursorStack.length > 1;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Moderation Log</h2>

      {logs.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-surface-elevated)] mb-4">
            <svg className="w-8 h-8 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No moderation actions yet</h3>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto">
            Once you or your moderators take actions (removing posts, banning users, editing settings, etc.),
            they'll appear here as an audit log for transparency and accountability.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {logs.map((log: ModLog) => (
          <div
            key={log.id}
            className="p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-sm"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="font-medium">{log.moderator_name || `Mod #${log.moderator_id}`}</span>
                <span className="text-[var(--color-text-secondary)]"> {getActionDescription(log)}</span>
              </div>
              <div className="text-xs text-[var(--color-text-secondary)]">
                {new Date(log.created_at).toLocaleString()}
              </div>
            </div>
            {log.details && Object.keys(log.details).length > 0 && (
              <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                {JSON.stringify(log.details, null, 2)}
              </div>
            )}
          </div>
        ))}
      </div>

      {logs.length > 0 && (
        <OffsetPaginationControls
          showDivider={false}
          className="mt-6 justify-center gap-4"
          hasPrev={hasPrev}
          hasMore={hasMore}
          onPrev={() => setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
          onNext={() => {
            const nextCursor = data?.next_cursor;
            if (nextCursor) {
              setCursorStack((prev) => [...prev, nextCursor]);
            }
          }}
          centerContent={<span className="px-4 py-2">Page {cursorStack.length}</span>}
        />
      )}
    </div>
  );
}

function getActionDescription(log: ModLog): string {
  const actions: Record<string, string> = {
    ban_user: 'banned user',
    unban_user: 'unbanned user',
    remove_post: 'removed post',
    approve_post: 'approved post',
    remove_comment: 'removed comment',
    approve_comment: 'approved comment',
    lock_post: 'locked post',
    unlock_post: 'unlocked post',
    pin_post: 'pinned post',
    unpin_post: 'unpinned post',
    create_removal_reason: 'created removal reason',
    update_removal_reason: 'updated removal reason',
    delete_removal_reason: 'deleted removal reason',
  };

  const description = actions[log.action] || log.action;

  if (log.target_type && log.target_id) {
    return `${description} (${log.target_type} #${log.target_id})`;
  }

  return description;
}

// ===== MOD MAIL TAB =====

function ModMailTab({ hubName }: { hubName: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'open' | 'archived' | 'resolved' | 'all'>('open');

  const { data, isLoading } = useQuery({
    queryKey: ['modMail', hubName, statusFilter],
    queryFn: () => modMailService.getHubModMail(hubName, statusFilter),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ conversationId, status }: { conversationId: number; status: 'open' | 'archived' | 'resolved' }) =>
      modMailService.updateStatus(conversationId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modMail', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>Loading mod mail...</LoadingMessage>
      </div>
    );
  }

  const conversations = data?.conversations || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Mod Mail</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'open' | 'archived' | 'resolved' | 'all')}
          className="px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
        >
          <option value="open">Open</option>
          <option value="archived">Archived</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </div>

      {conversations.length === 0 && (
        <div className="text-center py-12">
          <EmptyMessage>
            No {statusFilter !== 'all' ? statusFilter : ''} mod mail conversations.
          </EmptyMessage>
        </div>
      )}

      <div className="space-y-3">
        {conversations.map((conv: ModMailConversation) => (
          <div
            key={conv.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/mod-mail/${conv.id}`)}
                    className="text-lg font-medium hover:text-[var(--color-primary)]"
                  >
                    {conv.subject}
                  </button>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      conv.status === 'open'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : conv.status === 'resolved'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {conv.status}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                      {conv.unread_count} new
                    </span>
                  )}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  <span>From: {conv.participants.find((p) => !p.is_moderator)?.username || 'Unknown'}</span>
                  <span className="mx-2">•</span>
                  <span>{new Date(conv.created_at).toLocaleDateString()}</span>
                  {conv.latest_message && (
                    <>
                      <span className="mx-2">•</span>
                      <span>Last reply: {new Date(conv.latest_message.sent_at).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="ml-4 flex gap-2">
                {conv.status === 'open' && (
                  <>
                    <button
                      onClick={() => updateStatusMutation.mutate({ conversationId: conv.id, status: 'resolved' })}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      disabled={updateStatusMutation.isPending}
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => updateStatusMutation.mutate({ conversationId: conv.id, status: 'archived' })}
                      className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                      disabled={updateStatusMutation.isPending}
                    >
                      Archive
                    </button>
                  </>
                )}
                {conv.status !== 'open' && (
                  <button
                    onClick={() => updateStatusMutation.mutate({ conversationId: conv.id, status: 'open' })}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    disabled={updateStatusMutation.isPending}
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== ACCESS REQUESTS TAB =====

function AccessRequestsTab({ hubName }: { hubName: string }) {
  const queryClient = useQueryClient();
  const [usernameInput, setUsernameInput] = useState('');
  const [addUserStatus, setAddUserStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [addUserError, setAddUserError] = useState('');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['accessRequests', hubName],
    queryFn: () => accessRequestService.getPendingRequests(hubName),
  });

  const addUserMutation = useMutation({
    mutationFn: (username: string) => accessRequestService.addUserAccess(hubName, username),
    onSuccess: () => {
      setAddUserStatus('success');
      setUsernameInput('');
      queryClient.invalidateQueries({ queryKey: ['accessRequests', hubName] });
    },
    onError: (error: Error) => {
      setAddUserStatus('error');
      setAddUserError(error.message || 'Failed to grant access');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: number) => accessRequestService.approveRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessRequests', hubName] });
    },
  });

  const denyMutation = useMutation({
    mutationFn: (requestId: number) => accessRequestService.denyRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessRequests', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>Loading...</LoadingMessage>
      </div>
    );
  }

  const pendingRequests = requests?.requests || [];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Access Requests</h2>

      <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Grant access by username</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Add a user directly to this private hub even if their request was denied.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = usernameInput.trim();
            if (!trimmed) return;
            setAddUserStatus('saving');
            setAddUserError('');
            addUserMutation.mutate(trimmed);
          }}
          className="mt-3 flex flex-col gap-3 md:flex-row"
        >
          <input
            type="text"
            value={usernameInput}
            onChange={(event) => {
              setUsernameInput(event.target.value);
              if (addUserStatus !== 'idle') {
                setAddUserStatus('idle');
              }
            }}
            placeholder="Enter username (e.g. TestUser)"
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <button
            type="submit"
            disabled={addUserMutation.isPending || usernameInput.trim().length === 0}
            className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addUserMutation.isPending ? 'Granting...' : 'Grant Access'}
          </button>
        </form>
        {addUserStatus === 'success' && (
          <p className="mt-2 text-sm text-green-600">Access granted successfully.</p>
        )}
        {addUserStatus === 'error' && (
          <p className="mt-2 text-sm text-red-600">{addUserError}</p>
        )}
      </div>

      {pendingRequests.length === 0 && (
        <div className="text-center py-12">
          <EmptyMessage>No pending access requests.</EmptyMessage>
        </div>
      )}

      <div className="space-y-3">
        {pendingRequests.map((request: AccessRequest) => (
          <div
            key={request.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{request.username || `User #${request.user_id}`}</span>
                  <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded">
                    Pending
                  </span>
                </div>
                {request.message && (
                  <div className="text-sm text-[var(--color-text-secondary)] mt-2 p-3 bg-[var(--color-surface)] rounded border border-[var(--color-border)]">
                    "{request.message}"
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-secondary)] mt-2">
                  Requested on {new Date(request.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="ml-4 flex gap-2">
                <button
                  onClick={() => {
                    if (confirm('Approve this access request?')) {
                      approveMutation.mutate(request.id);
                    }
                  }}
                  disabled={approveMutation.isPending || denyMutation.isPending}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    if (confirm('Deny this access request?')) {
                      denyMutation.mutate(request.id);
                    }
                  }}
                  disabled={approveMutation.isPending || denyMutation.isPending}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
