import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface BanUserModalProps {
  username: string;
  onConfirm: (reason: string, deleteMessages: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function BanUserModal({ username, onConfirm, onCancel, isLoading }: BanUserModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [deleteMessages, setDeleteMessages] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
          {t('groups.admin.banUser')}: <span className="text-[var(--color-error)]">{username}</span>
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          {t('groups.admin.banWarning')}
        </p>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            {t('groups.admin.reason')}{' '}
            <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('groups.admin.reasonPlaceholder')}
            rows={3}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none resize-none"
          />
        </div>

        <label className="flex items-center gap-2 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteMessages}
            onChange={(e) => setDeleteMessages(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
          />
          <span className="text-sm text-[var(--color-text-secondary)]">
            {t('groups.admin.deleteMessages')}
          </span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason, deleteMessages)}
            disabled={isLoading}
            className="flex-1 rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isLoading
              ? t('groups.admin.banning', { defaultValue: 'Banning…' })
              : t('groups.admin.ban')}
          </button>
        </div>
      </div>
    </div>
  );
}
