import { Modal } from './Modal';

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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg"
      overlayClassName="bg-black/50"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Submit a Crosspost</h3>
        <button
          onClick={onClose}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
        <p>You can crosspost to an OmniHub, a subreddit, or both. At least one destination is required.</p>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
            Crosspost to OmniHub (optional)
          </label>
          <select
            value={hubValue}
            onChange={(e) => onHubChange(e.target.value)}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">Select a hub...</option>
            {hubOptions.map((hub) => (
              <option key={hub.id} value={hub.name}>
                h/{hub.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
            Crosspost to subreddit (optional)
          </label>
          {allowSubredditInput ? (
            <input
              type="text"
              value={subredditValue}
              onChange={(e) => onSubredditChange(e.target.value)}
              placeholder="e.g., cats, technology, AskReddit"
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]"
            />
          ) : (
            <select
              value={subredditValue}
              onChange={(e) => onSubredditChange(e.target.value)}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">Select a subreddit...</option>
              {subredditOptions.map((subreddit) => (
                <option key={subreddit.id} value={subreddit.name}>
                  r/{subreddit.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
            Choose a title <span className="text-red-500">*required</span>
          </label>
          <input
            type="text"
            value={titleValue}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)]"
            placeholder="Enter title..."
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
            Send replies to this post to my inbox
          </label>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting || isSubmitDisabled}
          className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
        >
          {isSubmitting ? 'Posting…' : 'Submit'}
        </button>
      </div>
    </Modal>
  );
}
