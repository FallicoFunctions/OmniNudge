import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
  const [pageUrl, setPageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPageUrl(initialUrl ?? '');
    setShowSuccess(false);
    setErrorMessage('');
  }, [initialUrl, isOpen]);

  const submitBugMutation = useMutation({
    mutationFn: async (screenshotUrl: string) => {
      return bugReportService.createBugReport({
        page_url: pageUrl,
        description,
        screenshot_url: screenshotUrl,
      });
    },
    onSuccess: () => {
      setPageUrl(initialUrl ?? '');
      setDescription('');
      setScreenshot(null);
      setShowSuccess(true);
      setErrorMessage('');
    },
    onError: (error) => {
      setErrorMessage(
        `Failed to submit bug report: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!screenshot) {
      setErrorMessage('Screenshot is required');
      return;
    }

    try {
      setErrorMessage('');
      setUploading(true);

      const response = await api.uploadFile<{ storage_url?: string; url?: string }>(
        '/media/upload',
        screenshot
      );
      const screenshotUrl = response.storage_url ?? response.url ?? '';
      if (!screenshotUrl) {
        throw new Error('Upload response missing file URL');
      }

      submitBugMutation.mutate(screenshotUrl);
    } catch (error) {
      setErrorMessage(
        `Failed to upload screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`
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
          <h2 className="text-2xl font-semibold text-[var(--color-text-primary)]">Report a Bug</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-2xl"
          >
            ×
          </button>
        </div>

        {showSuccess ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
              Bug report submitted successfully! Thank you for helping improve OmniNudge.
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {onNavigateToPage && (
                <button
                  type="button"
                  onClick={onNavigateToPage}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Go to Bug Reporting Page
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
              >
                OK
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
              Page URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              required
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://omninudge.com/..."
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              The URL of the page where you encountered the bug
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Describe the bug in detail. What happened? What did you expect to happen? Steps to reproduce?"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Screenshot <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              required
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file && !file.type.startsWith('image/')) {
                  setScreenshot(null);
                  setErrorMessage('Screenshot must be an image file.');
                  e.target.value = '';
                  return;
                }
                setErrorMessage('');
                setScreenshot(file);
              }}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] file:mr-4 file:rounded file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[var(--color-primary-dark)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              A screenshot helps us identify and fix the issue faster
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {onNavigateToPage && (
              <button
                type="button"
                onClick={onNavigateToPage}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
              >
                Go to Bug Reporting Page
              </button>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || submitBugMutation.isPending}
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading || submitBugMutation.isPending ? 'Submitting...' : 'Submit Bug Report'}
              </button>
            </div>
          </div>
          </form>
        )}
    </Modal>
  );
}
