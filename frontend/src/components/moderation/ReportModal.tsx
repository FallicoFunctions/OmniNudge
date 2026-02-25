import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reportService, type ReportReason, type ReportTargetType } from '../../services/reportService';

const REASON_OPTIONS: { value: ReportReason; labelKey: string }[] = [
  { value: 'spam', labelKey: 'reporting.reasons.spam' },
  { value: 'harassment', labelKey: 'reporting.reasons.harassment' },
  { value: 'illegal_content', labelKey: 'reporting.reasons.illegalContent' },
  { value: 'csam', labelKey: 'reporting.reasons.csam' },
  { value: 'violence', labelKey: 'reporting.reasons.violence' },
  { value: 'hate_speech', labelKey: 'reporting.reasons.hateSpeech' },
  { value: 'other', labelKey: 'reporting.reasons.other' },
];

const MAX_DESCRIPTION_LENGTH = 500;

export interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: number;
  targetName?: string;
}

export function ReportModal({ isOpen, onClose, targetType, targetId, targetName }: ReportModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setReason('spam');
    setDescription('');
    setSubmitError(null);
    setSubmitSuccess(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await reportService.createReport({
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined,
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      const isRateLimited =
        error instanceof Error && error.message.includes('429');
      if (isRateLimited) {
        setSubmitError(t('reporting.errors.rateLimited'));
      } else {
        setSubmitError(
          t('reporting.errors.failed', {
            message: error instanceof Error ? error.message : t('common.error'),
          })
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerLabel = targetName
    ? t('reporting.modal.titleWithName', { name: targetName })
    : t('reporting.modal.title');

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2
            id="report-modal-title"
            className="text-base font-semibold text-[var(--color-text-primary)]"
          >
            {headerLabel}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close')}
            className="flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {submitSuccess ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success)]/15">
              <svg
                className="h-6 w-6 text-[var(--color-success)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t('reporting.success')}
            </p>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Reason selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="report-reason"
                className="block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('reporting.modal.reasonLabel')}
                <span className="ml-1 text-[var(--color-error)]" aria-hidden="true">
                  *
                </span>
              </label>
              <select
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional description */}
            <div className="space-y-1.5">
              <label
                htmlFor="report-description"
                className="block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('reporting.modal.descriptionLabel')}
                <span className="ml-1 text-sm font-normal text-[var(--color-text-secondary)]">
                  {t('common.optional')}
                </span>
              </label>
              <textarea
                id="report-description"
                value={description}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_DESCRIPTION_LENGTH) {
                    setDescription(e.target.value);
                  }
                }}
                rows={3}
                placeholder={t('reporting.modal.descriptionPlaceholder')}
                className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
              <p className="text-right text-xs text-[var(--color-text-muted)]">
                {description.length}/{MAX_DESCRIPTION_LENGTH}
              </p>
            </div>

            {/* Error message */}
            {submitError && (
              <p
                role="alert"
                className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]"
              >
                {submitError}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-text-secondary)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
              >
                {isSubmitting ? t('reporting.modal.submitting') : t('reporting.modal.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
