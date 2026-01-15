import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { MarkdownInput } from '../common/MarkdownInput';

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
      className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
      overlayClassName="bg-black/40"
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Edit post</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Update the title or body, then save your changes.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">
            Title
          </label>
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <MarkdownInput
          label="Body"
          value={draftBody}
          onChange={setDraftBody}
          placeholder="Update the post body..."
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
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ title: draftTitle, body: draftBody })}
            disabled={!trimmedTitle || isSaving}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
