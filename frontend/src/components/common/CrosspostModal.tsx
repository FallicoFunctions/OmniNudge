import { Modal } from './Modal';
import { useTranslation } from 'react-i18next';
import { ModalCloseButton } from '../ui/ModalCloseButton';

type CrosspostOption = {
  id: number;
  name: string;
};

type CrosspostModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hubOptions: CrosspostOption[];
  subredditOptions?: CrosspostOption[];
  allowSubredditInput?: boolean;
  hubValue: string;
  subredditValue: string;
  titleValue: string;
  sendRepliesToInbox: boolean;
  onHubChange: (value: string) => void;
  onSubredditChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onToggleSendReplies: (value: boolean) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  isSubmitDisabled?: boolean;
};

export function CrosspostModal({
  isOpen,
  onClose,
  hubOptions,
  subredditOptions = [],
  allowSubredditInput = false,
  hubValue,
  subredditValue,
  titleValue,
  sendRepliesToInbox,
  onHubChange,
  onSubredditChange,
  onTitleChange,
  onToggleSendReplies,
  onSubmit,
  isSubmitting = false,
  isSubmitDisabled = false,
}: CrosspostModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
      overlayClassName="bg-black/50"
    >
      {/* MODAL-3: Standard close button */}
      <ModalCloseButton onClose={onClose} />

      <div className="pr-12 mb-4">
        <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t('modals.crosspost.title')}
        </h3>
      </div>
      <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
        <p>{t('modals.crosspost.info')}</p>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
            {t('modals.crosspost.toHub')}
          </label>
          <select
            value={hubValue}
            onChange={(e) => onHubChange(e.target.value)}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">{t('modals.crosspost.selectHub')}</option>
            {hubOptions.map((hub) => (
              <option key={hub.id} value={hub.name}>
                {t('common.format.hubPath', { name: hub.name })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
            {t('modals.crosspost.toSubreddit')}
          </label>
          {allowSubredditInput ? (
            <input
              type="text"
              value={subredditValue}
              onChange={(e) => onSubredditChange(e.target.value)}
              placeholder={t('messages.compose.hubSubredditPlaceholder')}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]"
            />
          ) : (
            <select
              value={subredditValue}
              onChange={(e) => onSubredditChange(e.target.value)}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">{t('modals.crosspost.selectSubreddit')}</option>
              {subredditOptions.map((subreddit) => (
                <option key={subreddit.id} value={subreddit.name}>
                  {t('common.format.subredditPath', { name: subreddit.name })}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
            {t('modals.crosspost.titleLabel')}{' '}
            <span className="text-red-500">{t('modals.crosspost.titleRequired')}</span>
          </label>
          <input
            type="text"
            value={titleValue}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)]"
            placeholder={t('modals.crosspost.titlePlaceholder')}
          />
        </div>
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="send-replies"
            checked={sendRepliesToInbox}
            onChange={(e) => onToggleSendReplies(e.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor="send-replies" className="text-sm text-[var(--color-text-primary)]">
            {t('modals.crosspost.sendRepliesLabel')}
          </label>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting || isSubmitDisabled}
          className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
        >
          {isSubmitting ? t('modals.crosspost.submitting') : t('modals.crosspost.submitButton')}
        </button>
      </div>
    </Modal>
  );
}
