import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { bugReportService } from '../../services/bugReportService';
import { api } from '../../lib/api';
import { Modal } from '../common/Modal';

type BugReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  onNavigateToPage?: () => void;
};

export default function BugReportModal({
  isOpen,
  onClose,
  initialUrl,
  onNavigateToPage,
}: BugReportModalProps) {
  const { t } = useTranslation();
  const [pageUrl, setPageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState<'bug' | 'feature_request' | 'other'>(
    'bug'
  );
  const [rating, setRating] = useState<number | ''>('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPageUrl(initialUrl ?? '');
    setFeedbackCategory('bug');
    setRating('');
    setDescription('');
    setScreenshot(null);
    setShowSuccess(false);
    setErrorMessage('');
  }, [initialUrl, isOpen]);

  const submitBugMutation = useMutation({
    mutationFn: async (screenshotUrl?: string) => {
      return bugReportService.createBugReport({
        page_url: pageUrl,
        description,
        screenshot_url: screenshotUrl,
        feedback_type: 'report',
        feedback_category: feedbackCategory,
        rating: rating === '' ? undefined : rating,
        context: {
          page_title: typeof document !== 'undefined' ? document.title : '',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          language: typeof navigator !== 'undefined' ? navigator.language : '',
          viewport:
            typeof window !== 'undefined'
              ? `${window.innerWidth}x${window.innerHeight}`
              : undefined,
        },
      });
    },
    onSuccess: () => {
      setPageUrl(initialUrl ?? '');
      setDescription('');
      setFeedbackCategory('bug');
      setRating('');
      setScreenshot(null);
      setShowSuccess(true);
      setErrorMessage('');
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t('bugReportModal.errors.unknownError');
      setErrorMessage(
        t('bugReportModal.errors.submitFailed', {
          message,
        })
      );
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating !== '' && (rating < 1 || rating > 5)) {
      setErrorMessage(t('bugReportModal.errors.ratingInvalid'));
      return;
    }

    let screenshotUrl: string | undefined;

    try {
      setErrorMessage('');
      if (screenshot) {
        setUploading(true);
        const response = await api.uploadFile<{ storage_url?: string; url?: string }>(
          '/media/upload',
          screenshot
        );
        screenshotUrl = response.storage_url ?? response.url ?? '';
        if (!screenshotUrl) {
          throw new Error(t('bugReportModal.errors.uploadMissingUrl'));
        }
      }

      submitBugMutation.mutate(screenshotUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('bugReportModal.errors.unknownError');
      setErrorMessage(
        t('bugReportModal.errors.uploadFailed', {
          message,
        })
      );
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="w-full max-w-2xl rounded-lg bg-[var(--color-surface)] p-6 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
        <h2 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          {t('bugReportModal.title')}
        </h2>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-2xl"
        >
          ×
        </button>
      </div>

      {showSuccess ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            {t('bugReportModal.success.message')}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {onNavigateToPage && (
              <button
                type="button"
                onClick={onNavigateToPage}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
              >
                {t('bugReportModal.success.goToPage')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
            >
              {t('bugReportModal.success.ok')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {errorMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {errorMessage}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('bugReportModal.form.pageUrl.label')} <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              required
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder={t('bugReportModal.form.pageUrl.placeholder')}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('bugReportModal.form.pageUrl.help')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('bugReportModal.form.description.label')} <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder={t('bugReportModal.form.description.placeholder')}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                {t('bugReportModal.form.category.label')}
              </label>
              <select
                value={feedbackCategory}
                onChange={(e) =>
                  setFeedbackCategory(e.target.value as 'bug' | 'feature_request' | 'other')
                }
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                <option value="bug">{t('bugReportModal.form.category.options.bug')}</option>
                <option value="feature_request">
                  {t('bugReportModal.form.category.options.featureRequest')}
                </option>
                <option value="other">{t('bugReportModal.form.category.options.other')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('bugReportModal.form.rating.label')}
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className={`h-9 w-9 rounded-md border text-sm font-semibold ${
                    rating === value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]'
                  }`}
                >
                  {value}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRating('')}
                className="ml-2 rounded-md border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
              >
                {t('bugReportModal.form.rating.clear')}
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('bugReportModal.form.rating.help')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('bugReportModal.form.screenshot.label')}
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file && !file.type.startsWith('image/')) {
                  setScreenshot(null);
                  setErrorMessage(t('bugReportModal.errors.screenshotMustBeImage'));
                  e.target.value = '';
                  return;
                }
                setErrorMessage('');
                setScreenshot(file);
              }}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] file:mr-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[var(--color-primary-dark)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('bugReportModal.form.screenshot.help')}
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {onNavigateToPage && (
              <button
                type="button"
                onClick={onNavigateToPage}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
              >
                {t('bugReportModal.success.goToPage')}
              </button>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={uploading || submitBugMutation.isPending}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading || submitBugMutation.isPending
                  ? t('bugReportModal.actions.submitting')
                  : t('bugReportModal.actions.submit')}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
