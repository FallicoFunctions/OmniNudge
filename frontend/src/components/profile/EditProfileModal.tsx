import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: {
    bio?: string | null;
    avatar_url?: string | null;
    status_text?: string | null;
  }) => Promise<void>;
  initialBio?: string | null;
  initialAvatarUrl?: string | null;
  initialStatusText?: string | null;
  isSaving?: boolean;
}

export default function EditProfileModal({
  isOpen,
  onClose,
  onSave,
  initialBio,
  initialAvatarUrl,
  initialStatusText,
  isSaving = false,
}: EditProfileModalProps) {
  const { t } = useTranslation();
  const [bio, setBio] = useState(initialBio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [statusText, setStatusText] = useState(initialStatusText ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBio(initialBio ?? '');
    setAvatarUrl(initialAvatarUrl ?? '');
    setStatusText(initialStatusText ?? '');
    setError(null);
  }, [initialAvatarUrl, initialBio, initialStatusText, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const trimmedBio = bio.trim();
    const trimmedAvatarUrl = avatarUrl.trim();
    const trimmedStatusText = statusText.trim();

    if (trimmedBio.length > 500) {
      setError(t('userProfilePage.edit.errors.bioTooLong'));
      return;
    }
    if (trimmedStatusText.length > 500) {
      setError(t('userProfilePage.edit.errors.statusTooLong'));
      return;
    }
    if (
      trimmedAvatarUrl &&
      !trimmedAvatarUrl.startsWith('http://') &&
      !trimmedAvatarUrl.startsWith('https://')
    ) {
      setError(t('userProfilePage.edit.errors.invalidAvatarUrl'));
      return;
    }

    setError(null);
    await onSave({
      bio: trimmedBio ? trimmedBio : null,
      avatar_url: trimmedAvatarUrl ? trimmedAvatarUrl : null,
      status_text: trimmedStatusText ? trimmedStatusText : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t('userProfilePage.edit.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t('userProfilePage.edit.description')}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="edit-profile-avatar-url"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              {t('userProfilePage.edit.avatarUrlLabel')}
            </label>
            <input
              id="edit-profile-avatar-url"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder={t('userProfilePage.edit.avatarUrlPlaceholder')}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="edit-profile-status-text"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              {t('userProfilePage.edit.statusLabel')}
            </label>
            <input
              id="edit-profile-status-text"
              type="text"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              maxLength={500}
              placeholder={t('userProfilePage.edit.statusPlaceholder')}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('userProfilePage.edit.statusCount', { count: statusText.length })}
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-profile-bio"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              {t('userProfilePage.edit.bioLabel')}
            </label>
            <textarea
              id="edit-profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              maxLength={500}
              placeholder={t('userProfilePage.edit.bioPlaceholder')}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('userProfilePage.edit.bioCount', { count: bio.length })}
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
