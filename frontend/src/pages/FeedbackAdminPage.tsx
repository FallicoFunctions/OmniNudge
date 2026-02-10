import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Feedback {
  id: number;
  user_id?: number;
  username?: string;
  rating?: number;
  category: string;
  message: string;
  page_url?: string;
  screenshot_url?: string;
  status: string;
  admin_notes?: string;
  created_at: string;
  reviewed_at?: string;
}

interface FeedbackStats {
  total: number;
  new: number;
  reviewed: number;
  resolved: number;
  by_category: Record<string, number>;
  average_rating?: number;
  last_24_hours: number;
}

export default function FeedbackAdminPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  // Fetch feedback list
  const { data: feedbackData, isLoading } = useQuery({
    queryKey: ['adminFeedback', statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      const response = await api.get<{ feedback: Feedback[] }>(
        `/admin/feedback?${params.toString()}`
      );
      return response.feedback;
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['feedbackStats'],
    queryFn: async () => {
      return await api.get<FeedbackStats>('/admin/feedback/stats');
    },
  });

  // Update status mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: number;
      status: string;
      notes?: string;
    }) => {
      return await api.put(`/admin/feedback/${id}`, {
        status,
        admin_notes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['feedbackStats'] });
      setSelectedFeedback(null);
      setAdminNotes('');
    },
  });

  const handleUpdateStatus = (status: string) => {
    if (!selectedFeedback) return;
    updateMutation.mutate({
      id: selectedFeedback.id,
      status,
      notes: adminNotes || undefined,
    });
  };

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">User Feedback</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-secondary mb-1">Total Feedback</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-secondary mb-1">New</div>
            <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
          </div>
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-secondary mb-1">Last 24 Hours</div>
            <div className="text-2xl font-bold">{stats.last_24_hours}</div>
          </div>
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-secondary mb-1">Avg Rating</div>
            <div className="text-2xl font-bold">
              {stats.average_rating ? stats.average_rating.toFixed(1) : 'N/A'} ★
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded bg-input text-primary"
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded bg-input text-primary"
        >
          <option value="all">All Categories</option>
          <option value="bug">Bug Report</option>
          <option value="feature_request">Feature Request</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Feedback List */}
      <div className="bg-card rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-secondary/10">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">User</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Category</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Rating</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Message</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {feedbackData?.map((feedback: Feedback) => (
              <tr key={feedback.id} className="hover:bg-secondary/5">
                <td className="px-6 py-4 text-sm">
                  {feedback.username || 'Anonymous'}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className="px-2 py-1 rounded text-xs bg-secondary/20">
                    {feedback.category.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {feedback.rating ? `${feedback.rating} ★` : '-'}
                </td>
                <td className="px-6 py-4 text-sm max-w-xs truncate">
                  {feedback.message}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      feedback.status === 'new'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : feedback.status === 'resolved'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {feedback.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-secondary">
                  {new Date(feedback.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => {
                      setSelectedFeedback(feedback);
                      setAdminNotes(feedback.admin_notes || '');
                    }}
                    className="px-3 py-1 text-sm bg-primary text-white rounded hover:bg-primary-dark"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Feedback Details</h2>

            <div className="space-y-4">
              <div>
                <span className="text-sm text-secondary">From:</span>{' '}
                <span className="font-medium">
                  {selectedFeedback.username || 'Anonymous'}
                </span>
              </div>

              <div>
                <span className="text-sm text-secondary">Category:</span>{' '}
                <span className="font-medium">
                  {selectedFeedback.category.replace('_', ' ')}
                </span>
              </div>

              {selectedFeedback.rating && (
                <div>
                  <span className="text-sm text-secondary">Rating:</span>{' '}
                  <span className="font-medium">{selectedFeedback.rating} ★</span>
                </div>
              )}

              <div>
                <span className="text-sm text-secondary block mb-2">Message:</span>
                <div className="bg-secondary/10 rounded p-4">
                  {selectedFeedback.message}
                </div>
              </div>

              {selectedFeedback.page_url && (
                <div>
                  <span className="text-sm text-secondary">Page:</span>{' '}
                  <a
                    href={selectedFeedback.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    {selectedFeedback.page_url}
                  </a>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Admin Notes
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded bg-input text-primary resize-none"
                  placeholder="Add internal notes..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdateStatus('reviewed')}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Mark Reviewed
                </button>
                <button
                  onClick={() => handleUpdateStatus('resolved')}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Mark Resolved
                </button>
                <button
                  onClick={() => handleUpdateStatus('ignored')}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                >
                  Ignore
                </button>
                <button
                  onClick={() => {
                    setSelectedFeedback(null);
                    setAdminNotes('');
                  }}
                  className="ml-auto px-4 py-2 border border-border rounded hover:bg-secondary/10"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
