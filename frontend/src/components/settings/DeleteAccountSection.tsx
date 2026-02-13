import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useFormat } from '../../hooks/useFormat';

interface DeletionStatus {
  pending_deletion: boolean;
  deletion_requested?: string;
  permanent_deletion?: string;
  days_until_deletion?: number;
  can_cancel?: boolean;
}

const CONFIRM_PHRASE = 'DELETE MY ACCOUNT';

function getErrorMessage(err: unknown): string | null {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return null;
}

export function DeleteAccountSection() {
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
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
    onError: (err: unknown) => {
      setError(getErrorMessage(err) || t('settings.deleteAccountSection.errors.deleteFailed'));
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
    if (confirmText !== CONFIRM_PHRASE) {
      setError(
        t('settings.deleteAccountSection.errors.confirmMismatch', { phrase: CONFIRM_PHRASE })
      );
      return;
    }
    deleteMutation.mutate();
  };

  // Pending deletion banner
  if (status?.pending_deletion) {
    const days = status.days_until_deletion ?? 0;
    const formattedCount = formatNumber(days);
    const formattedDate = status.permanent_deletion
      ? formatDate(status.permanent_deletion, { dateStyle: 'medium' })
      : '';
    const dateSuffix = status.permanent_deletion
      ? t('settings.deleteAccountSection.pending.onDate', { formattedDate })
      : '';

    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
          {t('settings.deleteAccountSection.pending.title')}
        </h3>
        <p className="text-red-800 dark:text-red-200 mb-4">
          <Trans
            i18nKey="settings.deleteAccountSection.pending.body"
            count={days}
            values={{ formattedCount, dateSuffix }}
            components={{ strong: <span className="font-bold" /> }}
          />
        </p>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">
          {t('settings.deleteAccountSection.pending.gracePeriod')}
        </p>
        {status.can_cancel && (
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
          >
            {cancelMutation.isPending
              ? t('settings.deleteAccountSection.pending.actions.cancelling')
              : t('settings.deleteAccountSection.pending.actions.cancel')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-t border-border pt-6">
        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
          {t('settings.deleteAccountSection.dangerZone.title')}
        </h3>
        <p className="text-sm text-secondary mb-4">
          {t('settings.deleteAccountSection.dangerZone.description')}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          {t('settings.deleteAccountSection.dangerZone.action')}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">
              {t('settings.deleteAccountSection.modal.title')}
            </h2>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4 mb-4">
              <p className="text-sm text-red-800 dark:text-red-200 mb-2">
                <Trans
                  i18nKey="settings.deleteAccountSection.modal.warningIntro"
                  components={{ strong: <strong /> }}
                />
              </p>
              <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
                <li>{t('settings.deleteAccountSection.modal.effects.messagesPosts')}</li>
                <li>{t('settings.deleteAccountSection.modal.effects.conversationsGroups')}</li>
                <li>{t('settings.deleteAccountSection.modal.effects.filesMedia')}</li>
                <li>{t('settings.deleteAccountSection.modal.effects.encryptionKeys')}</li>
              </ul>
              <p className="text-sm text-red-800 dark:text-red-200 mt-2">
                <Trans
                  i18nKey="settings.deleteAccountSection.modal.graceNote"
                  components={{ strong: <strong /> }}
                />
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  {t('settings.deleteAccountSection.modal.fields.passwordLabel')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-input text-primary"
                  placeholder={t('settings.deleteAccountSection.modal.fields.passwordPlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  {t('settings.deleteAccountSection.modal.fields.confirmLabel', {
                    phrase: CONFIRM_PHRASE,
                  })}
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-input text-primary font-mono"
                  placeholder={t('settings.deleteAccountSection.modal.fields.confirmPlaceholder', {
                    phrase: CONFIRM_PHRASE,
                  })}
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
                  {t('settings.deleteAccountSection.modal.actions.cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending || !password || confirmText !== CONFIRM_PHRASE}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteMutation.isPending
                    ? t('settings.deleteAccountSection.modal.actions.deleting')
                    : t('settings.deleteAccountSection.modal.actions.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
