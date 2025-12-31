import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { modMailService } from '../../services/modMailService';

interface ModMailModalProps {
  hubName: string;
  onClose: () => void;
}

export function ModMailModal({ hubName, onClose }: ModMailModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      modMailService.createModMail({
        hub_name: hubName,
        subject,
        message,
      }),
    onSuccess: () => {
      setSuccess(true);
      // Close the modal after a brief delay to show success message
      setTimeout(() => {
        onClose();
      }, 1500);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to send mod mail');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }

    if (!message.trim()) {
      setError('Message is required');
      return;
    }

    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-[var(--color-surface-elevated)] rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-semibold">Message the Moderators</h3>
            <p className="text-[var(--color-text-secondary)] text-sm mt-1">
              Send a message to the moderators of h/{hubName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="subject" className="block text-sm font-medium mb-2">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              placeholder="What's this about?"
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-2">
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder="Write your message to the moderators..."
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}

          {success && (
            <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded p-3">
              Message sent successfully! The moderators will see your message.
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending || success}
              className="px-4 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || success}
              className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Sending...' : success ? 'Sent!' : 'Send to Moderators'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
