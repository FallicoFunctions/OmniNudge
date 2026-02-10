import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface DeletionStatus {
  pending_deletion: boolean;
  deletion_requested?: string;
  permanent_deletion?: string;
  days_until_deletion?: number;
  can_cancel?: boolean;
}

export function DeleteAccountSection() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');

  // Check deletion status
  const { data: status } = useQuery({
    queryKey: ['accountDeletionStatus'],
    queryFn: async () => {
      return await api.get<DeletionStatus>('/account/deletion-status');
    },
    refetchInterval: 60000, // Refetch every minute
  });

  // Request deletion mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/account/delete', {
        password,
        confirm: confirmText,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountDeletionStatus'] });
      setShowModal(false);
      setPassword('');
      setConfirmText('');
      setError('');
      // Log user out after deletion
      setTimeout(() => logout(), 2000);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to delete account');
    },
  });

  // Cancel deletion mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/account/cancel-deletion', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountDeletionStatus'] });
    },
  });

  const handleDelete = () => {
    setError('');
    if (confirmText !== 'DELETE MY ACCOUNT') {
      setError('Please type "DELETE MY ACCOUNT" to confirm');
      return;
    }
    deleteMutation.mutate();
  };

  // Pending deletion banner
  if (status?.pending_deletion) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
          Account Scheduled for Deletion
        </h3>
        <p className="text-red-800 dark:text-red-200 mb-4">
          Your account will be permanently deleted in{' '}
          <span className="font-bold">{status.days_until_deletion} days</span>
          {status.permanent_deletion && (
            <> on {new Date(status.permanent_deletion).toLocaleDateString()}</>
          )}.
        </p>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">
          During the grace period, you can cancel the deletion and restore your account.
          After the deletion date, all your data will be permanently removed and cannot be recovered.
        </p>
        {status.can_cancel && (
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
          >
            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Deletion'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-t border-border pt-6">
        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
          Danger Zone
        </h3>
        <p className="text-sm text-secondary mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Delete Account
        </button>
      </div>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Delete Account</h2>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4 mb-4">
              <p className="text-sm text-red-800 dark:text-red-200 mb-2">
                <strong>Warning:</strong> This action will:
              </p>
              <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
                <li>Delete all your messages and posts</li>
                <li>Remove you from all conversations and groups</li>
                <li>Delete all your files and media</li>
                <li>Erase your encryption keys (messages cannot be recovered)</li>
              </ul>
              <p className="text-sm text-red-800 dark:text-red-200 mt-2">
                You have a <strong>30-day grace period</strong> to cancel the deletion.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-input text-primary"
                  placeholder="Enter your password"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Type "DELETE MY ACCOUNT" to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-input text-primary font-mono"
                  placeholder="DELETE MY ACCOUNT"
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setPassword('');
                    setConfirmText('');
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 border border-border rounded hover:bg-secondary/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending || !password || confirmText !== 'DELETE MY ACCOUNT'}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
