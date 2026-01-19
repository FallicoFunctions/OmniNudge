import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { accessRequestService } from '../services/accessRequestService';
import { useHubSettings } from '../hooks/useHubSettings';
import { useSettings } from '../contexts/SettingsContext';

export default function PrivateHubPage() {
  const { hubname } = useParams<{ hubname: string }>();
  const { user } = useAuth();
  const { accessRequestCooldownDisplay } = useSettings();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [requestStatus, setRequestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [nowTimestamp, setNowTimestamp] = useState(0);
  const normalizedHubName = hubname?.trim().toLowerCase() ?? '';

  useEffect(() => {
    setNowTimestamp(Date.now());
  }, []);

  const { data: hubSettings } = useHubSettings(normalizedHubName, Boolean(normalizedHubName));

  const { data: requestStatusData } = useQuery({
    queryKey: ['accessRequestStatus', normalizedHubName],
    queryFn: () => accessRequestService.getRequestStatus(normalizedHubName),
    enabled: Boolean(user && normalizedHubName),
  });

  const { data: userRequests } = useQuery({
    queryKey: ['accessRequestHistory', normalizedHubName],
    queryFn: () => accessRequestService.getUserRequests(),
    enabled: Boolean(user && normalizedHubName),
  });

  const currentRequest = useMemo(() => {
    const requests = userRequests?.requests ?? [];
    return requests.find((request) => request.hub_name?.toLowerCase() === normalizedHubName) ?? null;
  }, [normalizedHubName, userRequests]);
  const deniedRequests = useMemo(() => {
    const requests = userRequests?.requests ?? [];
    return requests
      .filter(
        (request) =>
          request.hub_name?.toLowerCase() === normalizedHubName && request.status === 'denied'
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [normalizedHubName, userRequests]);

  const isPendingRequest = requestStatusData?.has_request && requestStatusData.status === 'pending';
  const requestStatusLabel = requestStatusData?.status ?? currentRequest?.status;
  const requestCreatedAt = currentRequest?.created_at;
  const cooldownDays = hubSettings?.access_request_cooldown_days ?? 0;
  const lastDeniedAt = deniedRequests[0]?.updated_at ?? deniedRequests[0]?.created_at;
  const cooldownEndsAt = lastDeniedAt
    ? new Date(lastDeniedAt).getTime() + cooldownDays * 24 * 60 * 60 * 1000
    : null;
  const cooldownActive = Boolean(
    cooldownDays > 0 && cooldownEndsAt && nowTimestamp < cooldownEndsAt
  );
  const cooldownDaysRemaining = cooldownEndsAt
    ? Math.max(0, Math.ceil((cooldownEndsAt - nowTimestamp) / (24 * 60 * 60 * 1000)))
    : 0;
  const cooldownDateLabel = cooldownEndsAt ? new Date(cooldownEndsAt).toLocaleDateString() : '';
  const canSubmitRequest =
    !requestStatusLabel || (requestStatusLabel === 'denied' && !cooldownActive);

  const requestMutation = useMutation({
    mutationFn: () => accessRequestService.createAccessRequest(hubname!, message),
    onSuccess: () => {
      setRequestStatus('success');
      queryClient.invalidateQueries({ queryKey: ['accessRequestStatus', hubname] });
      queryClient.invalidateQueries({ queryKey: ['accessRequestHistory', normalizedHubName] });
    },
    onError: (error: Error) => {
      setRequestStatus('error');
      setErrorMessage(error.message || 'Failed to submit access request');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPendingRequest) {
      return;
    }
    if (cooldownActive) {
      return;
    }
    setRequestStatus('loading');
    requestMutation.mutate();
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="bg-[var(--color-surface)] rounded-lg shadow-lg p-8 border border-[var(--color-border)]">
            <svg className="mx-auto h-16 w-16 text-[var(--color-text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              Private Hub
            </h1>
            <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-4">
              h/{hubname}
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-6">
              This hub is private. You must have approval to view its contents.
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }))}
              className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
            >
              Request Access
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (requestStatus === 'success') {
    if (isPendingRequest) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
          <div className="max-w-md w-full mx-4 text-center">
            <div className="bg-[var(--color-surface)] rounded-lg shadow-lg p-8 border border-[var(--color-border)]">
              <svg className="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
                Request Submitted
              </h1>
              <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-4">
                h/{hubname}
              </h2>
              <p className="text-[var(--color-text-secondary)] mb-4">
                Your access request is pending review by the moderators.
              </p>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 text-left">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">Status</span>
                  <span className="font-semibold capitalize text-[var(--color-text-primary)]">
                    {requestStatusLabel ?? 'pending'}
                  </span>
                </div>
                {requestCreatedAt && (
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Requested</span>
                    <span className="text-[var(--color-text-primary)]">
                      {new Date(requestCreatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                You can submit another request after this one is reviewed.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="bg-[var(--color-surface)] rounded-lg shadow-lg p-8 border border-[var(--color-border)]">
            <svg className="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              Request Submitted
            </h1>
            <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-4">
              h/{hubname}
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-6">
              Your access request has been submitted to the moderators. You will be notified when they review it.
            </p>
            <button
              onClick={() => {
                setRequestStatus('idle');
                setMessage('');
              }}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              Submit Another Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-[var(--color-surface)] rounded-lg shadow-lg p-8 border border-[var(--color-border)]">
          <div className="text-center mb-6">
            <svg className="mx-auto h-16 w-16 text-[var(--color-text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              Private Hub
            </h1>
            <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-4">
              h/{hubname}
            </h2>
            <p className="text-[var(--color-text-secondary)]">
              This hub is private. Request access to view its contents.
            </p>
          {requestStatusLabel && (
            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 text-left">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">Status</span>
                <span className="font-semibold capitalize text-[var(--color-text-primary)]">
                  {requestStatusLabel}
                </span>
              </div>
              {requestCreatedAt && (
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">Requested</span>
                  <span className="text-[var(--color-text-primary)]">
                    {new Date(requestCreatedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}
          {cooldownActive && (
            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 text-left text-sm text-[var(--color-text-secondary)]">
              {accessRequestCooldownDisplay === 'days' && (
                <>
                  You can request access again in{' '}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {cooldownDaysRemaining} {cooldownDaysRemaining === 1 ? 'day' : 'days'}
                  </span>
                  .
                </>
              )}
              {accessRequestCooldownDisplay === 'date' && (
                <>
                  You can request access again on{' '}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {cooldownDateLabel}
                  </span>
                  .
                </>
              )}
              {accessRequestCooldownDisplay === 'both' && (
                <>
                  You can request access again in{' '}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {cooldownDaysRemaining} {cooldownDaysRemaining === 1 ? 'day' : 'days'}
                  </span>{' '}
                  (on{' '}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {cooldownDateLabel}
                  </span>
                  ).
                </>
              )}
            </div>
          )}
        </div>

          {requestStatus === 'error' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {errorMessage}
            </div>
          )}

          {deniedRequests.length > 0 && (
            <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 text-left">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Previous denials</h3>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
                {deniedRequests.map((request) => (
                  <li key={request.id}>
                    {new Date(request.updated_at ?? request.created_at).toLocaleDateString()} - denied
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canSubmitRequest && (
            <>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    Message to moderators (optional)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Introduce yourself and explain why you'd like to join..."
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    rows={4}
                    maxLength={1000}
                  />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 text-right">
                    {message.length}/1000
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={requestMutation.isPending || isPendingRequest}
                  className="w-full px-4 py-3 bg-[var(--color-primary)] text-white rounded-lg font-semibold hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {requestMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Submitting...
                    </span>
                  ) : (
                    isPendingRequest ? 'Request Pending' : 'Request Access'
                  )}
                </button>
              </form>

              <p className="text-xs text-[var(--color-text-muted)] mt-4 text-center">
                By submitting this request, you agree to follow the hub's rules if approved.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
