import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hubSettingsService } from '../../services/hubSettingsService';
import type { ModeratorRole } from '../../types/hubSettings';
import { LoadingMessage } from '../common/StatusMessage';
import { getHubModeratorRoleLabel } from '../../utils/moderation';

interface Props {
  hubName: string;
  isOwner: boolean;
}

export default function ModeratorsTab({ hubName, isOwner }: Props) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newModUsername, setNewModUsername] = useState('');
  const [newModRole, setNewModRole] = useState<ModeratorRole>('moderator');

  // Fetch moderators
  const { data: moderatorsData, isLoading } = useQuery({
    queryKey: ['hubModerators', hubName],
    queryFn: () => hubSettingsService.getHubModerators(hubName),
  });

  // Add moderator mutation
  const addModMutation = useMutation({
    mutationFn: (data: { username: string; role: ModeratorRole }) =>
      hubSettingsService.addModerator(hubName, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubModerators', hubName] });
      setShowAddModal(false);
      setNewModUsername('');
      setNewModRole('moderator');
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: ModeratorRole }) =>
      hubSettingsService.updateModeratorRole(hubName, userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubModerators', hubName] });
    },
  });

  // Remove moderator mutation
  const removeMutation = useMutation({
    mutationFn: (userId: number) => hubSettingsService.removeModerator(hubName, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubModerators', hubName] });
    },
  });

  const handleAddModerator = () => {
    const username = newModUsername.trim();
    if (username) {
      addModMutation.mutate({ username, role: newModRole });
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>Loading...</LoadingMessage>
      </div>
    );
  }

  const moderators = moderatorsData?.moderators || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            Moderator Team
          </h2>
          <p className="text-[var(--color-text-secondary)]">
            Manage moderators and their permissions
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] transition-colors"
          >
            Add Moderator
          </button>
        )}
      </div>

      {/* Role Descriptions */}
      <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded p-4">
        <h3 className="font-medium text-[var(--color-text-primary)] mb-3">Moderator Roles</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium text-[var(--color-text-primary)]">Owner:</span>
            <span className="text-[var(--color-text-secondary)] ml-2">
              Full control, can manage all settings and moderators
            </span>
          </div>
          <div>
            <span className="font-medium text-[var(--color-text-primary)]">
              Moderator (settings access):
            </span>
            <span className="text-[var(--color-text-secondary)] ml-2">
              Can change settings and moderate content
            </span>
          </div>
          <div>
            <span className="font-medium text-[var(--color-text-primary)]">
              Moderator (content only):
            </span>
            <span className="text-[var(--color-text-secondary)] ml-2">
              Can moderate content only, cannot change settings
            </span>
          </div>
        </div>
      </div>

      {/* Moderators List */}
      <div className="border border-[var(--color-border)] rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--color-background)]">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-primary)]">
                Moderator
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-primary)]">
                Role
              </th>
              {isOwner && (
                <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-primary)]">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {moderators.map((mod) => (
              <tr key={mod.id} className="hover:bg-[var(--color-background)]">
                <td className="px-4 py-3">
                  <div className="flex items-center">
                    {mod.avatar_url ? (
                      <img
                        src={mod.avatar_url}
                        alt={mod.username}
                        className="w-8 h-8 rounded-full mr-3"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white mr-3">
                        {mod.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-[var(--color-text-primary)]">{mod.username}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {isOwner && mod.role !== 'owner' ? (
                    <select
                      value={mod.role}
                      onChange={(e) =>
                        updateRoleMutation.mutate({
                          userId: mod.user_id,
                          role: e.target.value as ModeratorRole,
                        })
                      }
                      className="px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text-primary)] text-sm"
                    >
                      <option value="full_moderator">Moderator (settings)</option>
                      <option value="moderator">Moderator (content only)</option>
                    </select>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded text-sm bg-[var(--color-background)] text-[var(--color-text-primary)]">
                      {mod.role === 'owner' ? '👑 Owner' : getHubModeratorRoleLabel(mod.role)}
                    </span>
                  )}
                </td>
                {isOwner && (
                  <td className="px-4 py-3 text-right">
                    {mod.role !== 'owner' && (
                      <button
                        onClick={() => {
                          if (
                            confirm(`Remove ${mod.username} as a moderator?`)
                          ) {
                            removeMutation.mutate(mod.user_id);
                          }
                        }}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Moderator Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">
              Add Moderator
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={newModUsername}
                  onChange={(e) => setNewModUsername(e.target.value)}
                  placeholder="Enter username..."
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Role
                </label>
                <select
                  value={newModRole}
                  onChange={(e) => setNewModRole(e.target.value as ModeratorRole)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="full_moderator">Moderator (settings)</option>
                  <option value="moderator">Moderator (content only)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-background)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddModerator}
                disabled={!newModUsername.trim() || addModMutation.isPending}
                className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addModMutation.isPending ? 'Adding...' : 'Add Moderator'}
              </button>
            </div>
            {addModMutation.isError && (
              <p className="text-red-600 text-sm mt-2">
                Failed to add moderator. Please check the username and try again.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
