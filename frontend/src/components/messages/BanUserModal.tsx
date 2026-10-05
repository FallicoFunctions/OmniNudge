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
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-text-primary mb-1">
          {t('groups.admin.banUser')}: <span className="text-(--color-error)">{username}</span>
        </h3>
        <p className="text-sm text-(--color-text-muted) mb-4">{t('groups.admin.banWarning')}</p>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-text-primary mb-2">
            {t('groups.admin.reason')}{' '}
            <span className="font-normal text-(--color-text-muted)">(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('groups.admin.reasonPlaceholder')}
            rows={3}
            className="w-full rounded-md border border-border bg-(--color-surface-elevated) px-3 py-2 text-sm text-text-primary placeholder-(--color-text-muted) focus:border-primary focus:outline-hidden resize-none"
          />
          <p className="mt-1 text-xs text-(--color-text-muted)">
            {t('groups.admin.banReasonGoesToBannedUser')}
          </p>
        </div>

        <label className="flex items-center gap-2 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteMessages}
            onChange={(e) => setDeleteMessages(e.target.checked)}
            className="h-4 w-4 rounded-sm border-border accent-primary"
          />
          <span className="text-sm text-text-secondary">{t('groups.admin.deleteMessages')}</span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-(--color-hover)"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason, deleteMessages)}
            disabled={isLoading}
            className="flex-1 rounded-md bg-(--color-error) px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
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
