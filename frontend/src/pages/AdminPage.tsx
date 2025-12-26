import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../services/adminService';
import type { AdminUser, SiteStats } from '../types/admin';

type TabType = 'stats' | 'users' | 'moderators';

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
        </nav>
      </div>

      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'moderators' && <ModeratorsTab />}
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
    return <div className="text-center py-12">Loading statistics...</div>;
  }

  if (!stats) {
    return <div className="text-center py-12 text-[var(--color-text-secondary)]">No statistics available</div>;
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

function UsersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['adminUsers', search, roleFilter, offset],
    queryFn: () => adminService.listUsers(search, roleFilter, limit, offset),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: 'user' | 'moderator' | 'admin' }) =>
      adminService.updateUserRole(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
  });

  const handleRoleChange = (userId: number, newRole: 'user' | 'moderator' | 'admin') => {
    if (window.confirm(`Are you sure you want to change this user's role to "${newRole}"?`)) {
      updateRoleMutation.mutate({ userId, role: newRole });
    }
  };

  return (
    <div>
      {/* Search and filters */}
      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="flex-1 px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setOffset(0);
          }}
          className="px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="moderator">Moderator</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {isLoading && <div className="text-center py-12">Loading users...</div>}

      {data && data.users.length === 0 && (
        <div className="text-center py-12 text-[var(--color-text-secondary)]">No users found</div>
      )}

      {data && data.users.length > 0 && (
        <>
          <div className="space-y-3">
            {data.users.map((user: AdminUser) => (
              <div
                key={user.id}
                className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.username}</span>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          user.role === 'admin'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : user.role === 'moderator'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {user.role}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-1">{user.email}</div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                      ID: {user.id} | Joined:{' '}
                      {new Date(user.created_at).toLocaleDateString()}
                      {user.last_seen_at && (
                        <> | Last seen: {new Date(user.last_seen_at).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                  <div className="ml-4">
                    <select
                      value={user.role}
                      onChange={(e) =>
                        handleRoleChange(user.id, e.target.value as 'user' | 'moderator' | 'admin')
                      }
                      className="px-3 py-1 text-sm border border-[var(--color-border)] rounded bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    >
                      <option value="user">User</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex justify-between items-center">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-4 py-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-[var(--color-text-secondary)]">
              Showing {offset + 1} - {Math.min(offset + limit, offset + data.users.length)}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={data.users.length < limit}
              className="px-4 py-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </>
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
          {hubsData?.map((hub: any) => (
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
        <div className="text-center py-12">Loading moderators...</div>
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
