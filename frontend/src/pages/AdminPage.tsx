import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../services/adminService';
import { bugReportService } from '../services/bugReportService';
import type { Hub } from '../services/hubsService';
import type { AdminUser, BanHistoryItem } from '../types/admin';
import { LoadingMessage } from '../components/common/StatusMessage';
import { EmptyState } from '../components/empty';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { useFormat } from '../hooks/useFormat';
import { useTranslation } from 'react-i18next';

type TabType = 'stats' | 'users' | 'moderators' | 'ban-activity' | 'bug-reports';

export default function AdminPage() {
  const { t } = useTranslation();
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
        <h1 className="text-3xl font-bold">{t('adminPage.title')}</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">{t('adminPage.subtitle')}</p>
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
            {t('adminPage.tabs.statistics')}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'users'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            {t('adminPage.tabs.userManagement')}
          </button>
          <button
            onClick={() => setActiveTab('moderators')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'moderators'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            {t('adminPage.tabs.hubModerators')}
          </button>
          <button
            onClick={() => setActiveTab('ban-activity')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'ban-activity'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            {t('adminPage.tabs.banActivity')}
          </button>
          <button
            onClick={() => setActiveTab('bug-reports')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'bug-reports'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
            }`}
          >
            {t('adminPage.tabs.bugReports')}
          </button>
        </nav>
      </div>

      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'moderators' && <ModeratorsTab />}
      {activeTab === 'ban-activity' && <BanActivityTab />}
      {activeTab === 'bug-reports' && <BugReportsTab />}
    </div>
  );
}

// ===== STATISTICS TAB =====

function StatsTab() {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: () => adminService.getSiteStats(),
  });

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <LoadingMessage>{t('adminPage.stats.loading')}</LoadingMessage>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <EmptyState illustration="noData" title={t('adminPage.stats.empty')} />
      </div>
    );
  }

  const statCards = [
    { label: t('adminPage.stats.cards.totalUsers'), value: stats.total_users, color: 'blue' },
    { label: t('adminPage.stats.cards.totalPosts'), value: stats.total_posts, color: 'green' },
    {
      label: t('adminPage.stats.cards.totalComments'),
      value: stats.total_comments,
      color: 'purple',
    },
    { label: t('adminPage.stats.cards.totalHubs'), value: stats.total_hubs, color: 'orange' },
    {
      label: t('adminPage.stats.cards.totalConversations'),
      value: stats.total_conversations,
      color: 'pink',
    },
    { label: t('adminPage.stats.cards.totalMessages'), value: stats.total_messages, color: 'cyan' },
    { label: t('adminPage.stats.cards.totalReports'), value: stats.total_reports, color: 'red' },
    { label: t('adminPage.stats.cards.admins'), value: stats.admin_count, color: 'yellow' },
    {
      label: t('adminPage.stats.cards.hubModerators'),
      value: stats.moderator_count,
      color: 'indigo',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className="p-6 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
        >
          <div className="text-sm text-[var(--color-text-secondary)] mb-1">{stat.label}</div>
          <div className="text-3xl font-bold">
            {typeof stat.value === 'number' ? formatNumber(stat.value) : '—'}
          </div>
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatDate, formatNumber } = useFormat();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [cursorStack, setCursorStack] = useState(['']);
  const [pageSize, setPageSize] = useState(50);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [bulkActionModal, setBulkActionModal] = useState<{ open: boolean; action: BanModalType }>({
    open: false,
    action: null,
  });
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
    queryFn: () =>
      adminService.listUsers(search, roleFilter, statusFilter, pageSize, 0, currentCursor),
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
    mutationFn: ({
      userId,
      reason,
      showReason,
    }: {
      userId: number;
      reason: string;
      showReason: boolean;
    }) => adminService.banUser(userId, reason, showReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setBanModal({ type: null, user: null, reason: '', showReason: false });
    },
  });

  const shadowBanUserMutation = useMutation({
    mutationFn: ({
      userId,
      reason,
      showReason,
    }: {
      userId: number;
      reason: string;
      showReason: boolean;
    }) => adminService.shadowBanUser(userId, reason, showReason),
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
    if (window.confirm(t('adminPage.users.confirmations.changeRole', { role: newRole }))) {
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
      alert(t('adminPage.users.errors.reasonRequired'));
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
      return (
        <span className="px-2 py-0.5 text-xs rounded bg-gray-500 text-white">
          {t('adminPage.status.deleted')}
        </span>
      );
    }
    if (user.banned) {
      return (
        <span className="px-2 py-0.5 text-xs rounded bg-red-600 text-white">
          {t('adminPage.status.banned')}
        </span>
      );
    }
    if (user.shadow_banned) {
      return (
        <span className="px-2 py-0.5 text-xs rounded bg-orange-600 text-white">
          {t('adminPage.status.shadowBanned')}
        </span>
      );
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
      setSelectedUsers(new Set(data.users.map((u) => u.id)));
    }
  };

  const handleBulkAction = (action: BanModalType) => {
    if (selectedUsers.size === 0) {
      alert(t('adminPage.users.bulk.noSelectionError'));
      return;
    }
    setBulkActionModal({ open: true, action });
    setBulkReason('');
    setBulkShowReason(false);
  };

  const submitBulkAction = async () => {
    if (!bulkReason.trim()) {
      alert(t('adminPage.users.errors.reasonRequired'));
      return;
    }

    const userIds = Array.from(selectedUsers);
    const bulkUserCount = userIds.length;
    const bulkUserQty = formatNumber(bulkUserCount);
    const promises = userIds.map((userId) => {
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
      alert(
        bulkUserCount === 1
          ? t('adminPage.users.bulk.successOne', { qty: bulkUserQty })
          : t('adminPage.users.bulk.successMany', { qty: bulkUserQty })
      );
    } catch (error) {
      console.error('Bulk admin action failed', error);
      alert(t('adminPage.users.bulk.error'));
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
      const formatCsvDate = (value: string | number | Date) =>
        formatDate(value, { year: 'numeric', month: '2-digit', day: '2-digit' });
      const headers = [
        t('adminPage.users.table.id'),
        t('adminPage.users.table.username'),
        t('adminPage.users.table.email'),
        t('adminPage.users.table.role'),
        t('adminPage.users.table.status'),
        t('adminPage.users.csv.headers.createdAt'),
        t('adminPage.users.lastSeen'),
      ];
      const rows = data.users.map((u) => [
        u.id,
        u.username,
        u.email || '',
        u.role,
        u.deleted
          ? t('adminPage.status.deleted')
          : u.banned
            ? t('adminPage.status.banned')
            : u.shadow_banned
              ? t('adminPage.status.shadowBanned')
              : t('adminPage.status.active'),
        formatCsvDate(u.created_at),
        u.last_seen_at ? formatCsvDate(u.last_seen_at) : t('adminPage.users.csv.never'),
      ]);
      const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const getUserActionLabel = (action: BanModalType | null | undefined) => {
    switch (action) {
      case 'shadow-ban':
        return t('adminPage.users.actions.shadowBan');
      case 'ban':
        return t('adminPage.users.actions.ban');
      case 'unban':
        return t('adminPage.users.actions.unban');
      case 'delete':
        return t('adminPage.users.actions.softDelete');
      default:
        return '';
    }
  };

  const selectedUserCount = selectedUsers.size;
  const selectedUserQty = formatNumber(selectedUserCount);

  return (
    <div>
      {/* Search and filters */}
      <div className="mb-4 flex gap-4 flex-wrap">
        <input
          type="text"
          placeholder={t('adminPage.users.searchPlaceholder')}
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
          <option value="">{t('adminPage.users.filters.allRoles')}</option>
          <option value="user">{t('adminPage.roles.user')}</option>
          <option value="admin">{t('adminPage.roles.admin')}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCursorStack(['']);
          }}
          className="px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">{t('adminPage.users.filters.allStatus')}</option>
          <option value="active">{t('adminPage.status.active')}</option>
          <option value="shadow_banned">{t('adminPage.status.shadowBanned')}</option>
          <option value="banned">{t('adminPage.status.banned')}</option>
          <option value="deleted">{t('adminPage.status.deleted')}</option>
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
              {t('adminPage.users.view.card')}
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-sm ${viewMode === 'table' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'}`}
            >
              {t('adminPage.users.view.table')}
            </button>
          </div>

          {/* Bulk actions */}
          {selectedUsers.size > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-[var(--color-text-secondary)]">
                {selectedUserCount === 1
                  ? t('adminPage.users.bulk.selectedOne', { qty: selectedUserQty })
                  : t('adminPage.users.bulk.selectedMany', { qty: selectedUserQty })}
              </span>
              <button
                onClick={() => handleBulkAction('shadow-ban')}
                className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
              >
                {t('adminPage.users.actions.shadowBan')}
              </button>
              <button
                onClick={() => handleBulkAction('ban')}
                className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
              >
                {t('adminPage.users.actions.ban')}
              </button>
              <button
                onClick={() => handleBulkAction('unban')}
                className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
              >
                {t('adminPage.users.actions.unban')}
              </button>
              <button
                onClick={() => setSelectedUsers(new Set())}
                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                {t('common.clear')}
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
            {t('adminPage.users.export.csv')}
          </button>
          <button
            onClick={() => exportUsers('json')}
            disabled={!data?.users || data.users.length === 0}
            className="px-3 py-1 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('adminPage.users.export.json')}
          </button>
        </div>
      </div>

      {/* Total count and page size selector */}
      {data && (
        <div className="mb-4 flex justify-between items-center text-sm text-[var(--color-text-secondary)]">
          <div>
            {typeof data.total === 'number'
              ? t('adminPage.users.showingWithTotal', {
                  shown: formatNumber(data.users.length),
                  total: formatNumber(data.total),
                })
              : t('adminPage.users.showing', { shown: formatNumber(data.users.length) })}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize">{t('adminPage.users.perPage')}</label>
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
          <LoadingMessage>{t('adminPage.users.loading')}</LoadingMessage>
        </div>
      )}

      {data && data.users.length === 0 && (
        <div className="text-center py-12">
          <EmptyState illustration="noData" title={t('adminPage.users.empty')} />
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
                            onClick={() =>
                              setExpandedUser(expandedUser === user.id ? null : user.id)
                            }
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
                        <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                          {user.email}
                        </div>
                        <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                          ID: {user.id} | Joined:{' '}
                          {formatDate(user.created_at, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          {user.last_seen_at && (
                            <>
                              {' '}
                              | {t('adminPage.users.lastSeen')}:{' '}
                              {formatDate(user.last_seen_at, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col gap-2">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value as 'user' | 'admin')}
                        className="px-3 py-1 text-sm border border-[var(--color-border)] rounded bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      >
                        <option value="user">{t('adminPage.roles.user')}</option>
                        <option value="admin">{t('adminPage.roles.admin')}</option>
                      </select>
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)
                          }
                          className="w-full px-3 py-1 text-sm border border-[var(--color-border)] rounded bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]"
                        >
                          {t('adminPage.users.actions.menu')} ▼
                        </button>
                        {actionMenuOpen === user.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-10">
                            <button
                              onClick={() => handleBanAction('shadow-ban', user)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)] rounded-t-lg"
                            >
                              {t('adminPage.users.actions.shadowBan')}
                            </button>
                            <button
                              onClick={() => handleBanAction('ban', user)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)]"
                            >
                              {t('adminPage.users.actions.ban')}
                            </button>
                            <button
                              onClick={() => handleBanAction('unban', user)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)]"
                            >
                              {t('adminPage.users.actions.unban')}
                            </button>
                            <button
                              onClick={() => handleBanAction('delete', user)}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-[var(--color-surface-hover)]"
                            >
                              {t('adminPage.users.actions.softDelete')}
                            </button>
                            <button
                              onClick={() => openBanHistory(user)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-hover)] rounded-b-lg border-t border-[var(--color-border)]"
                            >
                              {t('adminPage.users.actions.viewBanHistory')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedUser === user.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium">
                            {t('adminPage.users.details.redditId')}:
                          </span>{' '}
                          {user.reddit_id || t('common.na')}
                        </div>
                        <div>
                          <span className="font-medium">{t('adminPage.users.details.karma')}:</span>{' '}
                          {t('common.na')}
                        </div>
                        <div>
                          <span className="font-medium">{t('adminPage.users.details.bio')}:</span>{' '}
                          {user.bio || t('common.na')}
                        </div>
                        <div>
                          <span className="font-medium">
                            {t('adminPage.users.details.avatar')}:
                          </span>{' '}
                          {user.avatar_url ? t('common.yes') : t('common.no')}
                        </div>
                        {user.banned_at && (
                          <div>
                            <span className="font-medium">
                              {t('adminPage.users.details.bannedAt')}:
                            </span>{' '}
                            {formatDate(user.banned_at, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                        {user.banned_by && (
                          <div>
                            <span className="font-medium">
                              {t('adminPage.users.details.bannedById')}:
                            </span>{' '}
                            {user.banned_by}
                          </div>
                        )}
                        {user.ban_reason && (
                          <div className="col-span-2">
                            <span className="font-medium">
                              {t('adminPage.users.details.banReason')}:
                            </span>{' '}
                            {user.ban_reason}
                            {user.show_ban_reason && (
                              <span className="ml-2 text-xs text-[var(--color-primary)]">
                                {t('adminPage.users.details.shownToUser')}
                              </span>
                            )}
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
                    <th className="p-3 text-left">{t('adminPage.users.table.id')}</th>
                    <th className="p-3 text-left">{t('adminPage.users.table.username')}</th>
                    <th className="p-3 text-left">{t('adminPage.users.table.email')}</th>
                    <th className="p-3 text-left">{t('adminPage.users.table.role')}</th>
                    <th className="p-3 text-left">{t('adminPage.users.table.status')}</th>
                    <th className="p-3 text-left">{t('adminPage.users.table.joined')}</th>
                    <th className="p-3 text-left">{t('adminPage.users.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user: AdminUser) => (
                    <tr
                      key={user.id}
                      className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                    >
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
                          onChange={(e) =>
                            handleRoleChange(user, e.target.value as 'user' | 'admin')
                          }
                          className="px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)]"
                        >
                          <option value="user">{t('adminPage.roles.user')}</option>
                          <option value="admin">{t('adminPage.roles.admin')}</option>
                        </select>
                      </td>
                      <td className="p-3">
                        {getUserStatusBadge(user) || (
                          <span className="text-[var(--color-text-secondary)]">
                            {t('adminPage.status.active')}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-[var(--color-text-secondary)]">
                        {formatDate(user.created_at, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="p-3">
                        <div className="relative">
                          <button
                            onClick={() =>
                              setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)
                            }
                            className="px-2 py-1 text-xs border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)]"
                          >
                            •••
                          </button>
                          {actionMenuOpen === user.id && (
                            <div className="absolute right-0 mt-1 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-10">
                              <button
                                onClick={() => handleBanAction('shadow-ban', user)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] rounded-t-lg"
                              >
                                {t('adminPage.users.actions.shadowBan')}
                              </button>
                              <button
                                onClick={() => handleBanAction('ban', user)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)]"
                              >
                                {t('adminPage.users.actions.ban')}
                              </button>
                              <button
                                onClick={() => handleBanAction('unban', user)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)]"
                              >
                                {t('adminPage.users.actions.unban')}
                              </button>
                              <button
                                onClick={() => handleBanAction('delete', user)}
                                className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-[var(--color-surface-hover)]"
                              >
                                {t('adminPage.users.actions.delete')}
                              </button>
                              <button
                                onClick={() => openBanHistory(user)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] rounded-b-lg border-t border-[var(--color-border)]"
                              >
                                {t('adminPage.users.actions.history')}
                              </button>
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
                {t('adminPage.pagination.page', { page: cursorStack.length })}
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
                  {t('adminPage.users.modals.bulkTitle', {
                    action: getUserActionLabel(bulkActionModal.action),
                  })}
                </h3>
                <p className="text-[var(--color-text-secondary)] mt-1">
                  {selectedUserCount === 1
                    ? t('adminPage.users.bulk.affectsOne', { qty: selectedUserQty })
                    : t('adminPage.users.bulk.affectsMany', { qty: selectedUserQty })}
                </p>
              </div>
              <button
                onClick={() => setBulkActionModal({ open: false, action: null })}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                aria-label={t('common.close')}
              >
                X
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="bulkReason" className="block text-sm font-medium mb-2">
                  {t('adminPage.users.modals.reasonLabel')}
                </label>
                <textarea
                  id="bulkReason"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder={t('adminPage.users.modals.reasonPlaceholder')}
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
                    {t('adminPage.users.modals.showReasonToUsers')}
                  </label>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setBulkActionModal({ open: false, action: null })}
                className="px-4 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitBulkAction}
                disabled={!bulkReason.trim()}
                className={`px-4 py-2 rounded text-white disabled:opacity-50 ${
                  bulkActionModal.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-strong)]'
                }`}
              >
                {selectedUserCount === 1
                  ? t('adminPage.users.bulk.confirmButtonOne', { qty: selectedUserQty })
                  : t('adminPage.users.bulk.confirmButtonMany', { qty: selectedUserQty })}
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
                  {t('adminPage.users.modals.singleTitle', {
                    action: getUserActionLabel(banModal.type),
                  })}
                </h3>
                <p className="text-[var(--color-text-secondary)] mt-1">
                  {t('adminPage.users.modals.userLabel')}{' '}
                  <span className="font-medium">{banModal.user.username}</span>
                </p>
              </div>
              <button
                onClick={() =>
                  setBanModal({ type: null, user: null, reason: '', showReason: false })
                }
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                aria-label={t('common.close')}
              >
                X
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="banReason" className="block text-sm font-medium mb-2">
                  {t('adminPage.users.modals.reasonLabel')}
                </label>
                <textarea
                  id="banReason"
                  value={banModal.reason}
                  onChange={(e) => setBanModal({ ...banModal, reason: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder={t('adminPage.users.modals.reasonPlaceholder')}
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
                    {t('adminPage.users.modals.showReasonToUser')}
                  </label>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() =>
                  setBanModal({ type: null, user: null, reason: '', showReason: false })
                }
                className="px-4 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitBanAction}
                disabled={
                  !banModal.reason.trim() ||
                  shadowBanUserMutation.isPending ||
                  banUserMutation.isPending ||
                  unbanUserMutation.isPending ||
                  softDeleteUserMutation.isPending
                }
                className={`px-4 py-2 rounded text-white disabled:opacity-50 ${
                  banModal.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-strong)]'
                }`}
              >
                {shadowBanUserMutation.isPending ||
                banUserMutation.isPending ||
                unbanUserMutation.isPending ||
                softDeleteUserMutation.isPending
                  ? t('adminPage.common.processing')
                  : t('common.confirm')}
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
                <h3 className="text-xl font-semibold">
                  {t('adminPage.users.banHistory.title', { username: historyModalUser.username })}
                </h3>
                <p className="text-[var(--color-text-secondary)] text-sm">
                  {t('adminPage.users.banHistory.subtitle')}
                </p>
              </div>
              <button
                onClick={() => {
                  setHistoryModalUser(null);
                  setBanHistory(null);
                }}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                aria-label={t('common.close')}
              >
                X
              </button>
            </div>

            {loadingHistory && (
              <div className="py-6 text-center">
                <LoadingMessage className="text-sm">
                  {t('adminPage.users.banHistory.loading')}
                </LoadingMessage>
              </div>
            )}
            {!loadingHistory && banHistory && banHistory.length === 0 && (
              <div className="py-6 text-center">
                <EmptyState illustration="noData" title={t('adminPage.users.banHistory.empty')} />
              </div>
            )}
            {!loadingHistory && banHistory && banHistory.length > 0 && (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {banHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-surface)]"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{entry.action}</span>
                      <span className="text-[var(--color-text-secondary)]">
                        {t('adminPage.users.banHistory.byLine', {
                          date: formatDate(entry.created_at, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }),
                          admin: entry.admin_name,
                        })}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="font-medium">{t('adminPage.labels.reason')}:</span>{' '}
                      {entry.reason}
                      {entry.show_reason && (
                        <span className="ml-2 text-xs text-[var(--color-primary)]">
                          {t('adminPage.users.details.shownToUser')}
                        </span>
                      )}
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

// ===== BUG REPORTS TAB =====

function BugReportsTab() {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const [cursorStack, setCursorStack] = useState(['']);
  const [pageSize, setPageSize] = useState(50);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);

  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';
  const { data, isLoading } = useQuery({
    queryKey: ['adminBugReports', statusFilter, pageSize, currentCursor],
    queryFn: () =>
      bugReportService.getBugReports(statusFilter || undefined, pageSize, 0, currentCursor),
  });

  const reports = data?.reports ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('adminPage.bugReports.title')}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('adminPage.bugReports.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCursorStack(['']);
            }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">{t('adminPage.bugReports.filters.allStatuses')}</option>
            <option value="new">{t('adminPage.bugReports.status.new')}</option>
            <option value="investigating">{t('adminPage.bugReports.status.investigating')}</option>
            <option value="fixed">{t('adminPage.bugReports.status.fixed')}</option>
            <option value="wont_fix">{t('adminPage.bugReports.status.wontFix')}</option>
            <option value="duplicate">{t('adminPage.bugReports.status.duplicate')}</option>
          </select>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCursorStack(['']);
            }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {t('adminPage.bugReports.filters.perPage', { count: size })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <LoadingMessage>{t('adminPage.bugReports.loading')}</LoadingMessage>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12">
          <EmptyState illustration="noData" title={t('adminPage.bugReports.empty')} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)]">
              <tr>
                <th className="p-3 text-left text-[var(--color-text-secondary)] font-medium">
                  {t('adminPage.bugReports.table.id')}
                </th>
                <th className="p-3 text-left text-[var(--color-text-secondary)] font-medium">
                  {t('adminPage.bugReports.table.status')}
                </th>
                <th className="p-3 text-left text-[var(--color-text-secondary)] font-medium">
                  {t('adminPage.bugReports.table.user')}
                </th>
                <th className="p-3 text-left text-[var(--color-text-secondary)] font-medium">
                  {t('adminPage.bugReports.table.page')}
                </th>
                <th className="p-3 text-left text-[var(--color-text-secondary)] font-medium">
                  {t('adminPage.bugReports.table.description')}
                </th>
                <th className="p-3 text-left text-[var(--color-text-secondary)] font-medium">
                  {t('adminPage.bugReports.table.submitted')}
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const isExpanded = expandedReportId === report.id;
                return (
                  <>
                    <tr
                      key={report.id}
                      onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                      className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                    >
                      <td className="p-3 font-medium text-[var(--color-text-primary)]">
                        #{report.id} {isExpanded ? '▲' : '▼'}
                      </td>
                      <td className="p-3 capitalize text-[var(--color-text-secondary)]">
                        {report.status.replace('_', ' ')}
                      </td>
                      <td className="p-3 text-[var(--color-text-secondary)]">
                        {report.username ||
                          (report.user_id
                            ? t('common.userNumber', { id: report.user_id })
                            : t('adminPage.bugReports.anonymous'))}
                      </td>
                      <td className="p-3 text-[var(--color-text-secondary)]">
                        <span className="block max-w-xs truncate">{report.page_url}</span>
                      </td>
                      <td className="p-3 text-[var(--color-text-secondary)]">
                        <span className="block max-w-md truncate">{report.description}</span>
                      </td>
                      <td className="p-3 text-[var(--color-text-secondary)]">
                        {formatDate(report.created_at, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr
                        key={`${report.id}-details`}
                        className="border-b border-[var(--color-border)]"
                      >
                        <td colSpan={6} className="p-4 bg-[var(--color-surface-elevated)]">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
                            <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                              <div>
                                <span className="font-medium text-[var(--color-text-primary)]">
                                  {t('adminPage.bugReports.details.status')}:
                                </span>{' '}
                                <span className="capitalize">
                                  {report.status.replace('_', ' ')}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium text-[var(--color-text-primary)]">
                                  {t('adminPage.bugReports.details.reporter')}:
                                </span>{' '}
                                {report.username ||
                                  (report.user_id
                                    ? t('common.userNumber', { id: report.user_id })
                                    : t('adminPage.bugReports.anonymous'))}
                              </div>
                              <div>
                                <span className="font-medium text-[var(--color-text-primary)]">
                                  {t('adminPage.bugReports.details.page')}:
                                </span>{' '}
                                <span className="break-words">{report.page_url}</span>
                              </div>
                              <div>
                                <span className="font-medium text-[var(--color-text-primary)]">
                                  {t('adminPage.bugReports.details.description')}:
                                </span>
                                <div className="mt-1 whitespace-pre-wrap text-[var(--color-text-primary)]">
                                  {report.description}
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                                {t('adminPage.bugReports.details.screenshot')}
                              </div>
                              {report.screenshot_url ? (
                                <a
                                  href={resolveMediaUrl(report.screenshot_url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block"
                                >
                                  <img
                                    src={resolveMediaUrl(report.screenshot_url)}
                                    alt={t('adminPage.bugReports.details.screenshotAlt')}
                                    className="max-h-[260px] w-full rounded-md border border-[var(--color-border)] object-contain bg-[var(--color-surface)]"
                                  />
                                </a>
                              ) : (
                                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-secondary)]">
                                  {t('adminPage.bugReports.details.noScreenshot')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <OffsetPaginationControls
          hasPrev={cursorStack.length > 1}
          hasMore={Boolean(data.next_cursor)}
          onPrev={() => {
            if (cursorStack.length > 1) {
              setCursorStack((prev) => prev.slice(0, -1));
            }
          }}
          onNext={() => {
            if (data.next_cursor) {
              setCursorStack((prev) => [...prev, data.next_cursor as string]);
            }
          }}
        />
      )}
    </div>
  );
}

// ===== MODERATORS TAB =====

function ModeratorsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatDate } = useFormat();
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
    if (window.confirm(t('adminPage.moderators.confirmRemove', { username }))) {
      removeMutation.mutate({ hubId: selectedHubId!, userId });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          {t('adminPage.moderators.selectHub')}
        </label>
        <select
          value={selectedHubId || ''}
          onChange={(e) => setSelectedHubId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">{t('adminPage.moderators.selectHubPlaceholder')}</option>
          {hubsData?.map((hub: Hub) => (
            <option key={hub.id} value={hub.id}>
              {t('common.format.hubPath', { name: hub.name })}
            </option>
          ))}
        </select>
      </div>

      {!selectedHubId && (
        <div className="text-center py-12 text-[var(--color-text-secondary)]">
          {t('adminPage.moderators.selectHubPrompt')}
        </div>
      )}

      {selectedHubId && isLoading && (
        <div className="text-center py-12">
          <LoadingMessage>{t('adminPage.moderators.loading')}</LoadingMessage>
        </div>
      )}

      {selectedHubId && !isLoading && moderators && (
        <>
          {moderators.length === 0 && (
            <div className="text-center py-12 text-[var(--color-text-secondary)]">
              {t('adminPage.moderators.empty')}
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
                        {t('adminPage.moderators.userId', { id: mod.user_id })} |{' '}
                        {t('adminPage.moderators.added', {
                          date: formatDate(mod.added_at, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }),
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(mod.user_id, mod.username)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      disabled={removeMutation.isPending}
                    >
                      {t('adminPage.moderators.remove')}
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
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const [cursorStack, setCursorStack] = useState(['']);
  const [pageSize, setPageSize] = useState(50);
  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['banActivity', pageSize, currentCursor],
    queryFn: () => adminService.getAllBanHistory(pageSize, 0, currentCursor),
  });
  const history = data?.history ?? [];

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCursorStack(['']);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">{t('adminPage.banActivity.title')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {t('adminPage.banActivity.subtitle')}
        </p>
      </div>

      {/* Total count and page size selector */}
      {data && (
        <div className="mb-4 flex justify-between items-center text-sm text-[var(--color-text-secondary)]">
          <div>
            {typeof data.total === 'number'
              ? t('adminPage.banActivity.showingWithTotal', {
                  shown: formatNumber(history.length),
                  total: formatNumber(data.total),
                })
              : t('adminPage.banActivity.showing', { shown: formatNumber(history.length) })}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="banPageSize">{t('adminPage.banActivity.perPage')}</label>
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
          <LoadingMessage>{t('adminPage.banActivity.loading')}</LoadingMessage>
        </div>
      )}

      {data && history.length === 0 && (
        <div className="text-center py-12">
          <EmptyState illustration="noData" title={t('adminPage.banActivity.empty')} />
        </div>
      )}

      {data && history.length > 0 && (
        <>
          <div className="space-y-3">
            {history.map((entry: BanHistoryItem) => (
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
                        {t('adminPage.banActivity.userId', { id: formatNumber(entry.user_id) })}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                      <span className="font-medium">{t('adminPage.labels.reason')}:</span>{' '}
                      {entry.reason}
                      {entry.show_reason && (
                        <span className="ml-2 text-xs text-[var(--color-primary)]">
                          {t('adminPage.users.details.shownToUser')}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                      {t('adminPage.banActivity.byLine', {
                        date: formatDate(entry.created_at, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                        admin: entry.admin_name,
                        id: formatNumber(entry.admin_id),
                      })}
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
                {t('adminPage.pagination.page', { page: formatNumber(cursorStack.length) })}
              </span>
            }
          />
        </>
      )}
    </div>
  );
}
