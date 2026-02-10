import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  overrides: Record<number, boolean>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  flag_key: string;
  changed_by: number;
  username: string;
  enabled: boolean;
  changed_at: string;
}

export default function FeatureFlagsAdminPage() {
  const queryClient = useQueryClient();
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(false);

  // Fetch all flags
  const { data: flagsData, isLoading } = useQuery({
    queryKey: ['adminFeatureFlags'],
    queryFn: async () => {
      const response = await api.get<{ flags: FeatureFlag[] }>('/admin/features');
      return response.flags;
    },
  });

  // Fetch audit log for selected flag
  const { data: auditData } = useQuery({
    queryKey: ['featureFlagAudit', selectedFlag],
    queryFn: async () => {
      if (!selectedFlag) return null;
      const response = await api.get<{ entries: AuditEntry[] }>(
        `/admin/features/${selectedFlag}/audit?limit=20`
      );
      return response.entries;
    },
    enabled: !!selectedFlag,
  });

  // Toggle flag mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      await api.put(`/admin/features/${key}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFeatureFlags'] });
    },
  });

  // Set user override mutation
  const setOverrideMutation = useMutation({
    mutationFn: async ({ key, userId, enabled }: { key: string; userId: number; enabled: boolean }) => {
      await api.post(`/admin/features/${key}/overrides`, {
        user_id: userId,
        enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFeatureFlags'] });
      setOverrideUserId('');
    },
  });

  // Remove override mutation
  const removeOverrideMutation = useMutation({
    mutationFn: async ({ key, userId }: { key: string; userId: number }) => {
      await api.delete(`/admin/features/${key}/overrides/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFeatureFlags'] });
    },
  });

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Feature Flags</h1>

      {/* Flags List */}
      <div className="bg-card rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-secondary/10">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Feature</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Description</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Overrides</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {flagsData?.map((flag: FeatureFlag) => (
              <tr key={flag.key} className="hover:bg-secondary/5">
                <td className="px-6 py-4">
                  <span className="font-mono text-sm">{flag.key}</span>
                </td>
                <td className="px-6 py-4 text-sm text-secondary">
                  {flag.description}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      flag.enabled
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {flag.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-secondary">
                  {Object.keys(flag.overrides || {}).length > 0
                    ? `${Object.keys(flag.overrides).length} users`
                    : 'None'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        toggleMutation.mutate({
                          key: flag.key,
                          enabled: !flag.enabled,
                        })
                      }
                      className="px-3 py-1 text-sm bg-primary text-white rounded hover:bg-primary-dark"
                    >
                      {flag.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() =>
                        setSelectedFlag(selectedFlag === flag.key ? null : flag.key)
                      }
                      className="px-3 py-1 text-sm bg-secondary text-primary rounded hover:bg-secondary/80"
                    >
                      {selectedFlag === flag.key ? 'Hide' : 'Manage'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Flag Details */}
      {selectedFlag && (
        <div className="mt-6 bg-card rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Manage <span className="font-mono text-primary">{selectedFlag}</span>
          </h2>

          {/* User Overrides */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3">User Overrides</h3>
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="User ID"
                  value={overrideUserId}
                  onChange={(e) => setOverrideUserId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded bg-input text-primary"
                />
                <label className="flex items-center gap-2 px-3 py-2 border border-border rounded bg-input">
                  <input
                    type="checkbox"
                    checked={overrideEnabled}
                    onChange={(e) => setOverrideEnabled(e.target.checked)}
                  />
                  <span className="text-sm">Enabled</span>
                </label>
                <button
                  onClick={() => {
                    const userId = parseInt(overrideUserId);
                    if (!isNaN(userId) && selectedFlag) {
                      setOverrideMutation.mutate({
                        key: selectedFlag,
                        userId,
                        enabled: overrideEnabled,
                      });
                    }
                  }}
                  className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
                >
                  Add Override
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {Object.entries(
                flagsData?.find((f: FeatureFlag) => f.key === selectedFlag)?.overrides || {}
              ).map(([userId, enabled]: [string, boolean]) => (
                <div
                  key={userId}
                  className="flex items-center justify-between px-3 py-2 bg-secondary/10 rounded"
                >
                  <span className="text-sm">
                    User {userId}:{' '}
                    <span className={enabled ? 'text-green-600' : 'text-red-600'}>
                      {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </span>
                  <button
                    onClick={() =>
                      removeOverrideMutation.mutate({
                        key: selectedFlag,
                        userId: parseInt(userId),
                      })
                    }
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Log */}
          <div>
            <h3 className="text-lg font-medium mb-3">Recent Changes</h3>
            <div className="space-y-2">
              {auditData && auditData.length > 0 ? (
                auditData.map((entry: AuditEntry, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-3 py-2 bg-secondary/10 rounded text-sm"
                  >
                    <span>
                      <span className="font-medium">{entry.username}</span> set to{' '}
                      <span className={entry.enabled ? 'text-green-600' : 'text-red-600'}>
                        {entry.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </span>
                    <span className="text-secondary">
                      {new Date(entry.changed_at).toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-secondary text-sm">No recent changes</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
