import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { MarkdownInput } from '../common/MarkdownInput';
import { ModalCloseButton } from '../ui/ModalCloseButton';

type PostEditModalProps = {
  isOpen: boolean;
  title: string;
  body: string;
  isSaving?: boolean;
  maxLength?: number;
  onClose: () => void;
  onSave: (next: { title: string; body: string }) => void;
};

export function PostEditModal({
  isOpen,
  title,
  body,
  isSaving = false,
  maxLength,
  onClose,
  onSave,
}: PostEditModalProps) {
  const { t } = useTranslation();
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);

  useEffect(() => {
    if (!isOpen) return;
    setDraftTitle(title);
    setDraftBody(body);
  }, [body, isOpen, title]);

  const trimmedTitle = draftTitle.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
      overlayClassName="bg-black/40"
    >
      {/* MODAL-3: Standard close button */}
      <ModalCloseButton onClose={onClose} />

      <div className="space-y-4">
        <div className="pr-12">
          <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('posts.editModal.title')}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('posts.editModal.subtitle')}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">
            {t('posts.editModal.fields.title')}
          </label>
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <MarkdownInput
          label={t('posts.editModal.fields.body')}
          value={draftBody}
          onChange={setDraftBody}
          placeholder={t('posts.editModal.placeholder')}
          rows={6}
          maxLength={maxLength}
        />

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onSave({ title: draftTitle, body: draftBody })}
            disabled={!trimmedTitle || isSaving}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? t('posts.editModal.actions.saving')
              : t('posts.editModal.actions.saveChanges')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
