import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../services/adminService';
import type { Hub } from '../services/hubsService';
import type { AdminUser, BanHistoryItem } from '../types/admin';
import { EmptyMessage, LoadingMessage } from '../components/common/StatusMessage';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';

type TabType = 'stats' | 'users' | 'moderators' | 'ban-activity';

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('stats');

  // Check if user is admin
  if (!user || user.role !== 'admin') {
    navigate('/');
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Site-wide administration and management
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('stats')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'stats'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'users'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('moderators')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'moderators'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            Hub Moderators
          </button>
          <button
            onClick={() => setActiveTab('ban-activity')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'ban-activity'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            Ban Activity
          </button>
        </nav>
      </div>

      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'moderators' && <ModeratorsTab />}
      {activeTab === 'ban-activity' && <BanActivityTab />}
    </div>
  );
}

// ===== STATISTICS TAB =====

function StatsTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: () => adminService.getSiteStats(),
  });

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <LoadingMessage>Loading statistics...</LoadingMessage>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <EmptyMessage>No statistics available.</EmptyMessage>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats.total_users, color: 'blue' },
    { label: 'Total Posts', value: stats.total_posts, color: 'green' },
    { label: 'Total Comments', value: stats.total_comments, color: 'purple' },
    { label: 'Total Hubs', value: stats.total_hubs, color: 'orange' },
    { label: 'Total Conversations', value: stats.total_conversations, color: 'pink' },
    { label: 'Total Messages', value: stats.total_messages, color: 'cyan' },
    { label: 'Total Reports', value: stats.total_reports, color: 'red' },
    { label: 'Admins', value: stats.admin_count, color: 'yellow' },
    { label: 'Hub Moderators', value: stats.moderator_count, color: 'indigo' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className="p-6 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
        >
          <div className="text-sm text-[var(--color-text-secondary)] mb-1">{stat.label}</div>
          <div className="text-3xl font-bold">{stat.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

// ===== USERS TAB =====

type BanModalType = 'shadow-ban' | 'ban' | 'unban' | 'delete' | null;

interface BanModalState {
  type: BanModalType;
  user: AdminUser | null;
  reason: string;
  showReason: boolean;
}

function UsersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [cursorStack, setCursorStack] = useState(['']);
  const [pageSize, setPageSize] = useState(50);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [bulkActionModal, setBulkActionModal] = useState<{ open: boolean; action: BanModalType }>({ open: false, action: null });
  const [bulkReason, setBulkReason] = useState('');
  const [bulkShowReason, setBulkShowReason] = useState(false);
  const [banModal, setBanModal] = useState<BanModalState>({
    type: null,
    user: null,
    reason: '',
    showReason: false,
  });
  const [historyModalUser, setHistoryModalUser] = useState<AdminUser | null>(null);
  const [banHistory, setBanHistory] = useState<BanHistoryItem[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);

  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['adminUsers', search, roleFilter, statusFilter, pageSize, currentCursor],
    queryFn: () => adminService.listUsers(search, roleFilter, statusFilter, pageSize, 0, currentCursor),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: 'user' | 'admin' }) =>
      adminService.updateUserRole(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
  });

  const banUserMutation = useMutation({
    mutationFn: ({ userId, reason, showReason }: { userId: number; reason: string; showReason: boolean }) =>
      adminService.banUser(userId, reason, showReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setBanModal({ type: null, user: null, reason: '', showReason: false });
    },
  });

  const shadowBanUserMutation = useMutation({
    mutationFn: ({ userId, reason, showReason }: { userId: number; reason: string; showReason: boolean }) =>
      adminService.shadowBanUser(userId, reason, showReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setBanModal({ type: null, user: null, reason: '', showReason: false });
    },
  });

  const unbanUserMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason: string }) =>
      adminService.unbanUser(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setBanModal({ type: null, user: null, reason: '', showReason: false });
    },
  });

  const softDeleteUserMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason: string }) =>
      adminService.softDeleteUser(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setBanModal({ type: null, user: null, reason: '', showReason: false });
    },
  });

  const handleRoleChange = (user: AdminUser, newRole: 'user' | 'admin') => {
    if (window.confirm(`Are you sure you want to change this user's role to "${newRole}"?`)) {
      updateRoleMutation.mutate({ userId: user.id, role: newRole });
    }
  };

  const openBanHistory = async (user: AdminUser) => {
    setHistoryModalUser(user);
    setBanHistory(null);
    setLoadingHistory(true);
    setActionMenuOpen(null);
    try {
      const res = await adminService.getBanHistory(user.id);
      setBanHistory(res.history);
    } catch (err) {
      console.error('Failed to load ban history', err);
      setBanHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleBanAction = (type: BanModalType, user: AdminUser) => {
    setBanModal({ type, user, reason: '', showReason: false });
    setActionMenuOpen(null);
  };

  const submitBanAction = () => {
    if (!banModal.user || !banModal.type) return;
    if (!banModal.reason.trim()) {
      alert('Reason is required');
      return;
    }

    const { user, reason, showReason } = banModal;

    switch (banModal.type) {
      case 'shadow-ban':
        shadowBanUserMutation.mutate({ userId: user.id, reason, showReason });
        break;
      case 'ban':
        banUserMutation.mutate({ userId: user.id, reason, showReason });
        break;
      case 'unban':
        unbanUserMutation.mutate({ userId: user.id, reason });
        break;
      case 'delete':
        softDeleteUserMutation.mutate({ userId: user.id, reason });
        break;
    }
  };

  useEffect(() => {
    setCursorStack(['']);
  }, [search, roleFilter, statusFilter, pageSize]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCursorStack(['']);
  };

  const getUserStatusBadge = (user: AdminUser) => {
    if (user.deleted) {
      return <span className="px-2 py-0.5 text-xs rounded bg-gray-500 text-white">Deleted</span>;
    }
    if (user.banned) {
      return <span className="px-2 py-0.5 text-xs rounded bg-red-600 text-white">Banned</span>;
    }
    if (user.shadow_banned) {
      return <span className="px-2 py-0.5 text-xs rounded bg-orange-600 text-white">Shadow Banned</span>;
    }
    return null;
  };

  const toggleUserSelection = (userId: number) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const toggleSelectAll = () => {
    if (!data?.users) return;
    if (selectedUsers.size === data.users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(data.users.map(u => u.id)));
    }
  };

  const handleBulkAction = (action: BanModalType) => {
    if (selectedUsers.size === 0) {
      alert('Please select at least one user');
      return;
    }
    setBulkActionModal({ open: true, action });
    setBulkReason('');
    setBulkShowReason(false);
  };

  const submitBulkAction = async () => {
    if (!bulkReason.trim()) {
      alert('Reason is required');
      return;
    }

    const userIds = Array.from(selectedUsers);
    const promises = userIds.map(userId => {
      switch (bulkActionModal.action) {
        case 'shadow-ban':
          return adminService.shadowBanUser(userId, bulkReason, bulkShowReason);
        case 'ban':
          return adminService.banUser(userId, bulkReason, bulkShowReason);
        case 'unban':
          return adminService.unbanUser(userId, bulkReason);
        case 'delete':
          return adminService.softDeleteUser(userId, bulkReason);
        default:
          return Promise.resolve();
      }
    });

    try {
      await Promise.all(promises);
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setBulkActionModal({ open: false, action: null });
      setSelectedUsers(new Set());
      alert(`Successfully applied action to ${userIds.length} users`);
    } catch (error) {
      console.error('Bulk admin action failed', error);
      alert('Some actions failed. Please check and try again.');
    }
  };

  const exportUsers = (format: 'csv' | 'json') => {
    if (!data?.users) return;

    if (format === 'json') {
      const jsonStr = JSON.stringify(data.users, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_export_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['ID', 'Username', 'Email', 'Role', 'Status', 'Created At', 'Last Seen'];
      const rows = data.users.map(u => [
        u.id,
        u.username,
        u.email || '',
        u.role,
        u.deleted ? 'Deleted' : u.banned ? 'Banned' : u.shadow_banned ? 'Shadow Banned' : 'Active',
        new Date(u.created_at).toLocaleDateString(),
        u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : 'Never'
      ]);
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div>
      {/* Search and filters */}
      <div className="mb-4 flex gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursorStack(['']);
          }}
          className="flex-1 min-w-[250px] px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setCursorStack(['']);
          }}
          className="px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCursorStack(['']);
          }}
          className="px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="shadow_banned">Shadow Banned</option>
          <option value="banned">Banned</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      {/* Toolbar with view mode, bulk actions, and export */}
      <div className="mb-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex border border-[var(--color-border)] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('card')}
              className={`px-3 py-1 text-sm ${viewMode === 'card' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'}`}
            >
              Card View
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-sm ${viewMode === 'table' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'}`}
            >
              Table View
            </button>
          </div>

          {/* Bulk actions */}
          {selectedUsers.size > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-[var(--color-text-secondary)]">
                {selectedUsers.size} selected
              </span>
              <button
                onClick={() => handleBulkAction('shadow-ban')}
                className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
              >
                Shadow Ban
              </button>
              <button
                onClick={() => handleBulkAction('ban')}
                className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
              >
                Ban
              </button>
              <button
                onClick={() => handleBulkAction('unban')}
                className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
              >
                Unban
              </button>
              <button
                onClick={() => setSelectedUsers(new Set())}
                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportUsers('csv')}
            disabled={!data?.users || data.users.length === 0}
            className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
          <button
            onClick={() => exportUsers('json')}
            disabled={!data?.users || data.users.length === 0}
            className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Total count and page size selector */}
      {data && (
        <div className="mb-4 flex justify-between items-center text-sm text-[var(--color-text-secondary)]">
          <div>
            Showing {data.users.length} users{typeof data.total === 'number' ? ` (Total ${data.total})` : ''}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize">Per page:</label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="px-3 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <LoadingMessage>Loading users...</LoadingMessage>
        </div>
      )}

      {data && data.users.length === 0 && (
        <div className="text-center py-12">
          <EmptyMessage>No users found.</EmptyMessage>
        </div>
      )}

      {data && data.users.length > 0 && (
        <>
          {/* Card View */}
          {viewMode === 'card' && (
            <div className="space-y-0">
              {data.users.map((user: AdminUser, idx: number) => (
                <div
                  key={user.id}
                  className={`border border-[var(--color-border)] bg-[var(--color-surface-elevated)] ${
                    idx === 0 ? 'rounded-t-lg' : ''
                  } ${idx === data.users.length - 1 ? 'rounded-b-lg' : 'border-t-0'}`}
                >
                  <div className="p-4 flex justify-between items-start">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                            className="font-medium hover:text-[var(--color-primary)]"
                          >
                            {user.username} {expandedUser === user.id ? '▲' : '▼'}
                          </button>
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${
                              user.role === 'admin'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                            }`}
                          >
                            {user.role}
                          </span>
                          {getUserStatusBadge(user)}
                        </div>
                        <div className="text-sm text-[var(--color-text-secondary)] mt-1">{user.email}</div>
                        <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                          ID: {user.id} | Joined: {new Date(user.created_at).toLocaleDateString()}
                          {user.last_seen_at && <> | Last seen: {new Date(user.last_seen_at).toLocaleDateString()}</>}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col gap-2">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value as 'user' | 'admin')}
                        className="px-3 py-1 text-sm border border-[var(--color-border)] rounded bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      <div className="relative">
                        <button
                          onClick={() => setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)}
                          className="w-full px-3 py-1 text-sm border border-[var(--color-border)] rounded bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]"
                        >
                          Actions ▼
                        </button>
                        {actionMenuOpen === user.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-10">
                            <button onClick={() => handleBanAction('shadow-ban', user)} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)] rounded-t-lg">Shadow Ban</button>
                            <button onClick={() => handleBanAction('ban', user)} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)]">Ban</button>
                            <button onClick={() => handleBanAction('unban', user)} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)]">Unban</button>
                            <button onClick={() => handleBanAction('delete', user)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-[var(--color-surface-hover)]">Soft Delete</button>
                            <button onClick={() => openBanHistory(user)} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)] rounded-b-lg border-t border-[var(--color-border)]">View Ban History</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedUser === user.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div><span className="font-medium">Reddit ID:</span> {user.reddit_id || 'N/A'}</div>
                        <div><span className="font-medium">Karma:</span> N/A</div>
                        <div><span className="font-medium">Bio:</span> {user.bio || 'N/A'}</div>
                        <div><span className="font-medium">Avatar:</span> {user.avatar_url ? 'Yes' : 'No'}</div>
                        {user.banned_at && <div><span className="font-medium">Banned at:</span> {new Date(user.banned_at).toLocaleString()}</div>}
                        {user.banned_by && <div><span className="font-medium">Banned by ID:</span> {user.banned_by}</div>}
                        {user.ban_reason && (
                          <div className="col-span-2">
                            <span className="font-medium">Ban reason:</span> {user.ban_reason}
                            {user.show_ban_reason && <span className="ml-2 text-xs text-[var(--color-primary)]">(shown to user)</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="p-3 text-left">
                      <input
                        type="checkbox"
                        checked={data.users.length > 0 && selectedUsers.size === data.users.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-3 text-left">ID</th>
                    <th className="p-3 text-left">Username</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Role</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Joined</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user: AdminUser) => (
                    <tr key={user.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                        />
                      </td>
                      <td className="p-3">{user.id}</td>
                      <td className="p-3 font-medium">{user.username}</td>
                      <td className="p-3 text-[var(--color-text-secondary)]">{user.email}</td>
                      <td className="p-3">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user, e.target.value as 'user' | 'admin')}
                          className="px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)]"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="p-3">{getUserStatusBadge(user) || <span className="text-[var(--color-text-secondary)]">Active</span>}</td>
                      <td className="p-3 text-[var(--color-text-secondary)]">{new Date(user.created_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <div className="relative">
                          <button
                            onClick={() => setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)}
                            className="px-2 py-1 text-xs border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
                          >
                            •••
                          </button>
                          {actionMenuOpen === user.id && (
                            <div className="absolute right-0 mt-1 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-10">
                              <button onClick={() => handleBanAction('shadow-ban', user)} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] rounded-t-lg">Shadow Ban</button>
                              <button onClick={() => handleBanAction('ban', user)} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)]">Ban</button>
                              <button onClick={() => handleBanAction('unban', user)} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)]">Unban</button>
                              <button onClick={() => handleBanAction('delete', user)} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-[var(--color-surface-hover)]">Delete</button>
                              <button onClick={() => openBanHistory(user)} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] rounded-b-lg border-t border-[var(--color-border)]">History</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Enhanced Pagination */}
          <OffsetPaginationControls
            showDivider={false}
            className="mt-6 gap-4"
            hasPrev={cursorStack.length > 1}
            hasMore={Boolean(data.next_cursor)}
            onPrev={() => setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
            onNext={() => {
              if (data.next_cursor) {
                setCursorStack((prev) => [...prev, data.next_cursor as string]);
              }
            }}
            centerContent={
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {cursorStack.length}
              </span>
            }
          />
        </>
      )}

      {/* Bulk Action Modal */}
      {bulkActionModal.open && bulkActionModal.action && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[var(--color-surface-elevated)] rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold">
                  Bulk {bulkActionModal.action === 'shadow-ban' ? 'Shadow Ban' :
                        bulkActionModal.action === 'ban' ? 'Ban' :
                        bulkActionModal.action === 'unban' ? 'Unban' : 'Delete'} Users
                </h3>
                <p className="text-[var(--color-text-secondary)] mt-1">
                  This will affect {selectedUsers.size} selected user{selectedUsers.size > 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setBulkActionModal({ open: false, action: null })}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                aria-label="Close"
              >
                X
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="bulkReason" className="block text-sm font-medium mb-2">
                  Reason (required)
                </label>
                <textarea
                  id="bulkReason"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="Enter reason..."
                />
              </div>

              {(bulkActionModal.action === 'shadow-ban' || bulkActionModal.action === 'ban') && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="bulkShowReason"
                    checked={bulkShowReason}
                    onChange={(e) => setBulkShowReason(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="bulkShowReason" className="text-sm">
                    Show reason to users
                  </label>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setBulkActionModal({ open: false, action: null })}
                className="px-4 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={submitBulkAction}
                disabled={!bulkReason.trim()}
                className={`px-4 py-2 rounded text-white disabled:opacity-50 ${
                  bulkActionModal.action === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-strong)]'
                }`}
              >
                Confirm ({selectedUsers.size} users)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban Action Modal */}
      {banModal.type && banModal.user && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[var(--color-surface-elevated)] rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold">
                  {banModal.type === 'shadow-ban' && 'Shadow Ban User'}
                  {banModal.type === 'ban' && 'Ban User'}
                  {banModal.type === 'unban' && 'Unban User'}
                  {banModal.type === 'delete' && 'Soft Delete User'}
                </h3>
                <p className="text-[var(--color-text-secondary)] mt-1">
                  User: <span className="font-medium">{banModal.user.username}</span>
                </p>
              </div>
              <button
                onClick={() => setBanModal({ type: null, user: null, reason: '', showReason: false })}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                aria-label="Close"
              >
                X
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="banReason" className="block text-sm font-medium mb-2">
                  Reason (required)
                </label>
                <textarea
                  id="banReason"
                  value={banModal.reason}
                  onChange={(e) => setBanModal({ ...banModal, reason: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="Enter reason..."
                />
              </div>

              {(banModal.type === 'shadow-ban' || banModal.type === 'ban') && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showReason"
                    checked={banModal.showReason}
                    onChange={(e) => setBanModal({ ...banModal, showReason: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="showReason" className="text-sm">
                    Show reason to user
                  </label>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setBanModal({ type: null, user: null, reason: '', showReason: false })}
                className="px-4 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={submitBanAction}
                disabled={!banModal.reason.trim() || shadowBanUserMutation.isPending || banUserMutation.isPending || unbanUserMutation.isPending || softDeleteUserMutation.isPending}
                className={`px-4 py-2 rounded text-white disabled:opacity-50 ${
                  banModal.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-strong)]'
                }`}
              >
                {(shadowBanUserMutation.isPending || banUserMutation.isPending || unbanUserMutation.isPending || softDeleteUserMutation.isPending) ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban History Modal */}
      {historyModalUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[var(--color-surface-elevated)] rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold">Ban history for {historyModalUser.username}</h3>
                <p className="text-[var(--color-text-secondary)] text-sm">Recent ban/shadow-ban/unban actions</p>
              </div>
              <button
                onClick={() => {
                  setHistoryModalUser(null);
                  setBanHistory(null);
                }}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                aria-label="Close"
              >
                X
              </button>
            </div>

            {loadingHistory && (
              <div className="py-6 text-center">
                <LoadingMessage className="text-sm">Loading...</LoadingMessage>
              </div>
            )}
            {!loadingHistory && banHistory && banHistory.length === 0 && (
              <div className="py-6 text-center">
                <EmptyMessage className="text-sm">No history found.</EmptyMessage>
              </div>
            )}
            {!loadingHistory && banHistory && banHistory.length > 0 && (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {banHistory.map((entry) => (
                  <div key={entry.id} className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-surface)]">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{entry.action}</span>
                      <span className="text-[var(--color-text-secondary)]">
                        {new Date(entry.created_at).toLocaleString()} by {entry.admin_name}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="font-medium">Reason:</span> {entry.reason}
                      {entry.show_reason && <span className="ml-2 text-xs text-[var(--color-primary)]">(shown to user)</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== MODERATORS TAB =====

function ModeratorsTab() {
  const queryClient = useQueryClient();
  const [selectedHubId, setSelectedHubId] = useState<number | null>(null);

  // Fetch all hubs
  const { data: hubsData } = useQuery({
    queryKey: ['allHubs'],
    queryFn: async () => {
      const response = await fetch('/api/v1/hubs?limit=1000&offset=0');
      const data = await response.json();
      return data.hubs || [];
    },
  });

  // Fetch moderators for selected hub
  const { data: moderators, isLoading } = useQuery({
    queryKey: ['hubModerators', selectedHubId],
    queryFn: () => adminService.getHubModerators(selectedHubId!),
    enabled: selectedHubId !== null,
  });

  const removeMutation = useMutation({
    mutationFn: ({ hubId, userId }: { hubId: number; userId: number }) =>
      adminService.removeHubModerator(hubId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubModerators', selectedHubId] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
  });

  const handleRemove = (userId: number, username: string) => {
    if (window.confirm(`Remove ${username} as moderator?`)) {
      removeMutation.mutate({ hubId: selectedHubId!, userId });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Hub</label>
        <select
          value={selectedHubId || ''}
          onChange={(e) => setSelectedHubId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">-- Select a hub --</option>
          {hubsData?.map((hub: Hub) => (
            <option key={hub.id} value={hub.id}>
              h/{hub.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedHubId && (
        <div className="text-center py-12 text-[var(--color-text-secondary)]">
          Select a hub to view and manage moderators
        </div>
      )}

      {selectedHubId && isLoading && (
        <div className="text-center py-12">
          <LoadingMessage>Loading moderators...</LoadingMessage>
        </div>
      )}

      {selectedHubId && !isLoading && moderators && (
        <>
          {moderators.length === 0 && (
            <div className="text-center py-12 text-[var(--color-text-secondary)]">
              No moderators for this hub
            </div>
          )}

          {moderators.length > 0 && (
            <div className="space-y-3">
              {moderators.map((mod) => (
                <div
                  key={mod.id}
                  className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{mod.username}</div>
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        User ID: {mod.user_id} | Added: {new Date(mod.added_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(mod.user_id, mod.username)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      disabled={removeMutation.isPending}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===== BAN ACTIVITY TAB =====

function BanActivityTab() {
  const [cursorStack, setCursorStack] = useState(['']);
  const [pageSize, setPageSize] = useState(50);
  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['banActivity', pageSize, currentCursor],
    queryFn: () => adminService.getAllBanHistory(pageSize, 0, currentCursor),
  });

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCursorStack(['']);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Site-wide Ban Activity</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          All ban, shadow-ban, unban, and delete actions across the site
        </p>
      </div>

      {/* Total count and page size selector */}
      {data && (
        <div className="mb-4 flex justify-between items-center text-sm text-[var(--color-text-secondary)]">
          <div>
            Showing {data.history.length} actions{typeof data.total === 'number' ? ` (Total ${data.total})` : ''}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="banPageSize">Per page:</label>
            <select
              id="banPageSize"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="px-3 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <LoadingMessage>Loading ban activity...</LoadingMessage>
        </div>
      )}

      {data && data.history.length === 0 && (
        <div className="text-center py-12">
          <EmptyMessage>No ban activity found.</EmptyMessage>
        </div>
      )}

      {data && data.history.length > 0 && (
        <>
          <div className="space-y-3">
            {data.history.map((entry: BanHistoryItem) => (
              <div
                key={entry.id}
                className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{entry.action}</span>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          entry.action.includes('ban') && !entry.action.includes('unban')
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : entry.action === 'unban'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                      >
                        User ID: {entry.user_id}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                      <span className="font-medium">Reason:</span> {entry.reason}
                      {entry.show_reason && <span className="ml-2 text-xs text-[var(--color-primary)]">(shown to user)</span>}
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                      {new Date(entry.created_at).toLocaleString()} by {entry.admin_name} (ID: {entry.admin_id})
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Enhanced Pagination */}
          <OffsetPaginationControls
            showDivider={false}
            className="mt-6 gap-4"
            hasPrev={cursorStack.length > 1}
            hasMore={Boolean(data.next_cursor)}
            onPrev={() => setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
            onNext={() => {
              if (data.next_cursor) {
                setCursorStack((prev) => [...prev, data.next_cursor as string]);
              }
            }}
            centerContent={
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {cursorStack.length}
              </span>
            }
          />
        </>
      )}
    </div>
  );
}
