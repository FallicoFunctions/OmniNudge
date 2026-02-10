/**
 * P0-035: Feedback Modal Component
 *
 * Modal for users to submit feedback, bug reports, or feature requests.
 * Uses i18n for internationalization.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { feedbackService, type FeedbackRequest } from '../services/feedbackService';
import { useAnalytics } from '../hooks/useAnalytics';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { t } = useTranslation();
  const { track } = useAnalytics();
  const [category, setCategory] = useState<'bug' | 'feature_request' | 'other'>('other');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      setSubmitError('Please enter a message');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const feedback: FeedbackRequest = {
        category,
        message: message.trim(),
        page_url: window.location.href,
        ...(rating && { rating }),
      };

      await feedbackService.submitFeedback(feedback);
      setSubmitSuccess(true);

      // Track feedback submission
      track('feedback_submitted', {
        category,
        has_rating: !!rating,
        rating,
      });

      // Reset form after 1.5 seconds and close
      setTimeout(() => {
        setMessage('');
        setRating(undefined);
        setCategory('other');
        setSubmitSuccess(false);
        onClose();
      }, 1500);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setMessage('');
      setRating(undefined);
      setCategory('other');
      setSubmitSuccess(false);
      setSubmitError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-[var(--color-bg-primary)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <h2 className="mb-4 text-xl font-bold text-[var(--color-text-primary)]">
          {t('feedback.title')}
        </h2>

        {submitSuccess ? (
          <div className="rounded-lg bg-green-500/10 p-4 text-center">
            <div className="mb-2 text-4xl">✓</div>
            <p className="font-semibold text-green-600 dark:text-green-400">
              {t('feedback.successMessage')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category */}
            <div>
              <label
                htmlFor="feedback-category"
                className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('feedback.categoryLabel')}
              </label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              >
                <option value="bug">{t('feedback.categoryBug')}</option>
                <option value="feature_request">{t('feedback.categoryFeature')}</option>
                <option value="other">{t('feedback.categoryOther')}</option>
              </select>
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="feedback-message"
                className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('feedback.messageLabel')} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                required
                placeholder={t('feedback.messagePlaceholder')}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>

            {/* Optional Rating */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]">
                {t('feedback.ratingLabel')}
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(rating === value ? undefined : value)}
                    className={`flex h-10 w-10 items-center justify-center rounded transition-all ${
                      rating === value
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {t('feedback.ratingHelp')}
              </p>
            </div>

            {/* Error message */}
            {submitError && (
              <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                {submitError}
              </div>
            )}

            {/* Submit button */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="flex-1 rounded-md bg-[var(--color-primary)] px-4 py-2 font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? t('feedback.sending') : t('feedback.send')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
