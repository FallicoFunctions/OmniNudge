import { Flag, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  OmniChatResponseFeedbackRequest,
  OmniChatResponseFeedbackReason,
} from '../../types/omnichat';
import { Modal } from '../common/Modal';

type Props = {
  isOpen: boolean;
  isSubmitting: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (feedback: OmniChatResponseFeedbackRequest) => void;
};

const REASONS: OmniChatResponseFeedbackReason[] = [
  'role_ownership',
  'user_agency',
  'narration_format',
  'repetition_length',
  'grammar_artifact',
  'character_mismatch',
  'other',
];

export default function OmniChatResponseReportModal({
  isOpen,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const noteId = useId();
  const [reason, setReason] = useState<OmniChatResponseFeedbackReason | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason(null);
      setNote('');
    }
  }, [isOpen]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason || isSubmitting) return;
    const trimmedNote = note.trim();
    onSubmit({ reason, ...(trimmedNote ? { note: trimmedNote } : {}) });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      overlayClassName="bg-black/80 backdrop-blur-md"
      className="w-full max-w-xl overflow-hidden rounded-t-[30px] border border-white/10 bg-[#11131b] shadow-[0_32px_100px_rgba(0,0,0,.65)] sm:rounded-[30px]"
      ariaLabelledBy="omnichat-response-report-title"
      ariaDescribedBy="omnichat-response-report-description"
      animation="quick-chat"
    >
      <form onSubmit={submit} className="flex max-h-[92dvh] flex-col">
        <header className="flex items-start justify-between border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#315ca8]/25 text-[#8eb1ff]">
              <Flag size={18} />
            </div>
            <div>
              <h2
                id="omnichat-response-report-title"
                className="text-xl font-semibold tracking-tight text-white"
              >
                {t('omnichat.responseReport.title')}
              </h2>
              <p
                id="omnichat-response-report-description"
                className="mt-1 text-sm leading-6 text-white/55"
              >
                {t('omnichat.responseReport.description')}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('omnichat.responseReport.close')}
            onClick={onClose}
            disabled={isSubmitting}
            className="omnichat-touch-target -mr-2 flex shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <fieldset disabled={isSubmitting}>
            <legend className="text-sm font-semibold text-white/80">
              {t('omnichat.responseReport.reasonLabel')}
            </legend>
            <div className="mt-3 grid gap-2">
              {REASONS.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm text-white/75 transition hover:border-[#5d8fff]/60 hover:bg-[#315ca8]/10 has-[:checked]:border-[#5d8fff] has-[:checked]:bg-[#315ca8]/15"
                >
                  <input
                    type="radio"
                    name="omnichat-response-report-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                    className="mt-0.5 h-4 w-4 border-white/30 bg-transparent text-[#5d8fff] focus:ring-[#7da8ff]"
                  />
                  <span>{t(`omnichat.responseReport.reasons.${option}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor={noteId} className="mt-5 block text-sm font-semibold text-white/80">
            {t('omnichat.responseReport.noteLabel')}
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isSubmitting}
            maxLength={1000}
            rows={3}
            placeholder={t('omnichat.responseReport.notePlaceholder')}
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#5d8fff] focus:outline-none focus:ring-2 focus:ring-[#5d8fff]/40 disabled:opacity-50"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-3 border-t border-white/10 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="omnichat-touch-target rounded-full px-4 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            {t('omnichat.responseReport.cancel')}
          </button>
          <button
            type="submit"
            disabled={!reason || isSubmitting}
            className="omnichat-touch-target rounded-full bg-[#426fc4] px-5 text-sm font-semibold text-white transition hover:bg-[#527fd3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7da8ff] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? t('omnichat.responseReport.sending')
              : t('omnichat.responseReport.submit')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
