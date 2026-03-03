import { useState, useEffect, useRef, useCallback, useId, type FormEvent } from 'react';
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
  defaultReason?: ReportReason;
}

export function ReportModal({ isOpen, onClose, targetType, targetId, targetName, defaultReason }: ReportModalProps) {
  const { t } = useTranslation();
  const uid = useId();
  const [reason, setReason] = useState<ReportReason>(defaultReason ?? 'spam');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Timer
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focusable element refs for the focus trap
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const successCloseBtnRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await reportService.createReport({ targetType, targetId, reason, description: description.trim() || undefined });
      setSubmitSuccess(true);
      autoCloseTimerRef.current = setTimeout(() => { handleClose(); }, 2000);
    } catch (error) {
      const status = (error as any)?.status;
      const message = error instanceof Error ? error.message : '';
      const isRateLimited =
        status === 429 ||
        message.includes('429') ||
        message.toLowerCase().includes('rate limit');
      if (isRateLimited) {
        setSubmitError(t('reporting.errors.rateLimited'));
      } else {
        setSubmitError(t('reporting.errors.failed', { message: message || t('common.error') }));
      }
    } finally {
      setIsSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId, reason, description, handleClose]);

  // Refs are stable across renders — empty deps is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getFocusable = useCallback(() =>
    [
      closeButtonRef.current,
      selectRef.current,
      textareaRef.current,
      cancelBtnRef.current,
      submitBtnRef.current,
      successCloseBtnRef.current,
    ].filter(
      (
        el,
      ): el is HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement =>
        el !== null && !el.disabled,
    ),
  []);

  useEffect(() => {
    if (isOpen) {
      setReason(defaultReason ?? 'spam');
      setDescription('');
      setSubmitError(null);
      setSubmitSuccess(false);
    }
  }, [isOpen, defaultReason]);

  useEffect(() => {
    if (isOpen) selectRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (submitSuccess) successCloseBtnRef.current?.focus();
  }, [submitSuccess]);

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  const headerLabel = targetName
    ? t('reporting.modal.titleWithName', { name: targetName })
    : t('reporting.modal.title');

  const titleId = `${uid}-title`;
  const descriptionId = `${uid}-description`;
  const reasonId = `${uid}-reason`;
  const detailsId = `${uid}-details`;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => { if (!isSubmitting) handleClose(); }}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const focusable = getFocusable();
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (!first || !last) return;
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        {/* Visually-hidden description for screen readers */}
        <p id={descriptionId} className="sr-only">
          {t('reporting.modal.screenReaderDescription')}
        </p>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2
            id={titleId}
            className="text-base font-semibold text-[var(--color-text-primary)]"
          >
            {headerLabel}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label={t('common.close')}
            className="flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
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
          <div role="status" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
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
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('reporting.successDetail')}
            </p>
            <button
              ref={successCloseBtnRef}
              type="button"
              onClick={handleClose}
              className="mt-2 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
            >
              {t('common.close')}
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Reason selector */}
            <div className="space-y-1.5">
              <label
                htmlFor={reasonId}
                className="block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('reporting.modal.reasonLabel')}
                <span className="ml-1 text-[var(--color-error)]" aria-hidden="true">
                  *
                </span>
              </label>
              <select
                ref={selectRef}
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                required
                aria-required="true"
                disabled={isSubmitting}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
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
                htmlFor={detailsId}
                className="block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('reporting.modal.descriptionLabel')}
                <span className="ml-1 text-sm font-normal text-[var(--color-text-secondary)]">
                  {t('common.optional')}
                </span>
              </label>
              <textarea
                ref={textareaRef}
                id={detailsId}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                onBlur={(e) => setDescription(e.target.value.trim())}
                rows={3}
                placeholder={t('reporting.modal.descriptionPlaceholder')}
                disabled={isSubmitting}
                className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p
                className="text-right text-xs text-[var(--color-text-muted)]"
                aria-label={t('reporting.modal.characterCount', { current: description.length, max: MAX_DESCRIPTION_LENGTH })}
              >
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
                ref={cancelBtnRef}
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
              >
                {t('common.cancel')}
              </button>
              <button
                ref={submitBtnRef}
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {t('reporting.modal.submitting')}
                  </span>
                ) : t('reporting.modal.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
