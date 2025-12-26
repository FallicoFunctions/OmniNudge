import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { moderationService } from '../services/moderationService';
import type {
  HubBan,
  CreateBanRequest,
  RemovalReason,
  CreateRemovalReasonRequest,
  ModLog,
} from '../types/moderation';

type TabType = 'bans' | 'removal_reasons' | 'mod_log';

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
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Mod Tools - h/{hubName}</h1>
        <p className="text-[var(--color-text-secondary)] mt-2">
          Manage users, content, and moderation settings
        </p>
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
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'bans' && <BansTab hubName={hubName} />}
      {activeTab === 'removal_reasons' && <RemovalReasonsTab hubName={hubName} />}
      {activeTab === 'mod_log' && <ModLogTab hubName={hubName} />}
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
    return <div className="text-center py-8">Loading...</div>;
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
        <div className="text-center py-12 text-[var(--color-text-secondary)]">
          No banned users
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
    return <div className="text-center py-8">Loading...</div>;
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
        <div className="text-center py-12 text-[var(--color-text-secondary)]">
          No removal reason templates
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
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['modLog', hubName, page],
    queryFn: () => moderationService.getModLog(hubName, limit, (page - 1) * limit),
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const logs = data?.logs || [];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Moderation Log</h2>

      {logs.length === 0 && (
        <div className="text-center py-12 text-[var(--color-text-secondary)]">
          No moderation actions yet
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

      {logs.length >= limit && (
        <div className="flex justify-center space-x-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-[var(--color-border)] rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">Page {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={logs.length < limit}
            className="px-4 py-2 border border-[var(--color-border)] rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
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
