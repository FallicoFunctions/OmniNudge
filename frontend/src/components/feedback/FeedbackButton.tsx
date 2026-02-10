import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { MessageSquare, X } from 'lucide-react';

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [category, setCategory] = useState('other');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: async (data: {
      rating: number | null;
      category: string;
      message: string;
      page_url: string;
    }) => {
      return await api.post('/feedback', data);
    },
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setRating(null);
        setCategory('other');
        setMessage('');
      }, 2000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    feedbackMutation.mutate({
      rating,
      category,
      message: message.trim(),
      page_url: window.location.href,
    });
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-primary hover:bg-primary-dark text-white rounded-full p-4 shadow-lg transition-all hover:scale-110"
        aria-label="Send Feedback"
      >
        <MessageSquare size={24} />
      </button>

      {/* Feedback modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-secondary hover:text-primary"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {submitted ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
                <p className="text-secondary">
                  We appreciate your feedback and will review it soon.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-4">Send Feedback</h2>
                <p className="text-sm text-secondary mb-6">
                  Help us improve OmniNudge by sharing your thoughts, reporting bugs, or suggesting features.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Rating */}
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      How satisfied are you? (optional)
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className={`text-2xl transition-colors ${
                            rating && star <= rating
                              ? 'text-yellow-500'
                              : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      What is this about?
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded bg-input text-primary"
                    >
                      <option value="bug">Bug Report</option>
                      <option value="feature_request">Feature Request</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Your feedback
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what's on your mind..."
                      rows={5}
                      required
                      className="w-full px-3 py-2 border border-border rounded bg-input text-primary resize-none"
                    />
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="flex-1 px-4 py-2 border border-border rounded hover:bg-secondary/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!message.trim() || feedbackMutation.isPending}
                      className="flex-1 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {feedbackMutation.isPending ? 'Sending...' : 'Send Feedback'}
                    </button>
                  </div>

                  {feedbackMutation.isError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        Failed to send feedback. Please try again.
                      </p>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
