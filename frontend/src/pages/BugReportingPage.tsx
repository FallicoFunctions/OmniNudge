import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bugReportService, type KnownBug } from '../services/bugReportService';
import { useAuth } from '../contexts/AuthContext';
import BugReportModal from '../components/bugReports/BugReportModal';

export default function BugReportingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  // If user is not logged in, trigger the auth modal and redirect to home
  useEffect(() => {
    if (!user) {
      // Small delay to ensure the event listener in MainLayout is ready
      const modalTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
      }, 100);

      // Redirect to home page after a longer delay (gives user time to see modal)
      const redirectTimer = setTimeout(() => {
        navigate('/');
      }, 500);

      return () => {
        clearTimeout(modalTimer);
        clearTimeout(redirectTimer);
      };
    }
  }, [user, navigate]);

  // Fetch known bugs
  const { data: knownBugsData, isLoading } = useQuery({
    queryKey: ['known-bugs'],
    queryFn: () => bugReportService.getKnownBugs(),
  });

  const knownBugs = knownBugsData?.bugs || [];

  const initialPageUrl = typeof window !== 'undefined' ? window.location.href : '';

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'fixed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'investigating':
        return 'bg-yellow-100 text-yellow-800';
      case 'wont_fix':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Don't render content if not logged in (modal will show)
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--color-text-secondary)]">Please log in to access bug reporting.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-6">Bug Reporting</h1>

      {/* Report a Bug Button */}
      <div className="mb-8">
        <button
          onClick={() => setShowModal(true)}
          className="w-full rounded-lg bg-[var(--color-primary)] px-6 py-4 text-lg font-semibold text-white hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          Report a Bug
        </button>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)] text-center">
          Found a bug? Help us improve OmniNudge by reporting it!
        </p>
      </div>

      {/* Known Bugs Section */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-4">Known Bugs</h2>

        {isLoading ? (
          <p className="text-[var(--color-text-secondary)]">Loading known bugs...</p>
        ) : knownBugs.length === 0 ? (
          <p className="text-[var(--color-text-secondary)]">No known bugs at this time.</p>
        ) : (
          <div className="space-y-4">
            {knownBugs.map((bug: KnownBug) => (
              <div
                key={bug.id}
                className={`rounded-lg border p-4 ${getSeverityColor(bug.severity)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold">{bug.title}</h3>
                  <div className="flex gap-2">
                    <span
                      className={`inline-block rounded px-2 py-1 text-xs font-semibold ${getStatusColor(
                        bug.status
                      )}`}
                    >
                      {formatStatus(bug.status)}
                    </span>
                    <span className="inline-block rounded border px-2 py-1 text-xs font-semibold uppercase">
                      {bug.severity}
                    </span>
                  </div>
                </div>

                <p className="text-sm mb-3">{bug.description}</p>

                {bug.affected_pages && bug.affected_pages.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs font-semibold">Affected Pages:</span>
                    <ul className="text-xs ml-4 mt-1">
                      {bug.affected_pages.map((page, idx) => (
                        <li key={idx} className="list-disc">
                          {page}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {bug.workaround && (
                  <div className="mt-3 rounded bg-white/50 p-3">
                    <span className="text-xs font-semibold">Workaround:</span>
                    <p className="text-xs mt-1">{bug.workaround}</p>
                  </div>
                )}

                {bug.fixed_in_version && (
                  <p className="text-xs mt-2 font-semibold">
                    Fixed in version: {bug.fixed_in_version}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BugReportModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        initialUrl={initialPageUrl}
      />
    </div>
  );
}
