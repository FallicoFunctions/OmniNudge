import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminService } from '../../services/adminService';
import type {
  AdminOmniChatResponseFeedbackDetail,
  AdminOmniChatResponseFeedbackStatus,
} from '../../types/admin';
import type { OmniChatResponseFeedbackReason } from '../../types/omnichat';
import { OffsetPaginationControls } from '../common/OffsetPaginationControls';
import { LoadingMessage } from '../common/StatusMessage';

const PAGE_SIZE = 25;
const STATUSES: AdminOmniChatResponseFeedbackStatus[] = [
  'new',
  'reviewed',
  'promoted',
  'dismissed',
];
const REASONS: OmniChatResponseFeedbackReason[] = [
  'role_ownership',
  'user_agency',
  'narration_format',
  'repetition_length',
  'grammar_artifact',
  'character_mismatch',
  'other',
];

function prettySnapshot(snapshot?: Record<string, unknown>): string {
  return snapshot ? JSON.stringify(snapshot, null, 2) : '';
}

function allowedTransitions(
  status: AdminOmniChatResponseFeedbackStatus
): AdminOmniChatResponseFeedbackStatus[] {
  if (status === 'new') return ['reviewed', 'dismissed'];
  if (status === 'reviewed') return ['promoted', 'dismissed'];
  return [];
}

export default function OmniChatResponseFeedbackTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AdminOmniChatResponseFeedbackStatus | ''>('new');
  const [reason, setReason] = useState<OmniChatResponseFeedbackReason | ''>('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ['adminOmniChatResponseFeedback', status, reason, offset],
    [status, reason, offset]
  );
  const feedbackQuery = useQuery({
    queryKey,
    queryFn: () =>
      adminService.listOmniChatResponseFeedback(
        status || undefined,
        reason || undefined,
        PAGE_SIZE,
        offset
      ),
  });
  const detailQuery = useQuery({
    queryKey: ['adminOmniChatResponseFeedbackDetail', selectedId],
    queryFn: () => adminService.getOmniChatResponseFeedback(selectedId as string),
    enabled: Boolean(selectedId),
  });
  const statusMutation = useMutation({
    mutationFn: ({
      id,
      nextStatus,
    }: {
      id: string;
      nextStatus: AdminOmniChatResponseFeedbackStatus;
    }) => adminService.updateOmniChatResponseFeedbackStatus(id, nextStatus),
    onSuccess: ({ feedback }) => {
      queryClient.setQueryData(
        ['adminOmniChatResponseFeedbackDetail', feedback.id],
        { feedback }
      );
      queryClient.invalidateQueries({ queryKey: ['adminOmniChatResponseFeedback'] });
    },
  });

  const resetSelection = () => {
    setOffset(0);
    setSelectedId(null);
    statusMutation.reset();
  };

  if (feedbackQuery.isLoading) {
    return (
      <div className="py-12 text-center">
        <LoadingMessage>{t('adminPage.responseFeedback.loading')}</LoadingMessage>
      </div>
    );
  }
  if (feedbackQuery.isError) {
    return (
      <p
        role="alert"
        className="rounded border border-red-300 bg-red-50 p-4 text-red-800"
      >
        {t('adminPage.responseFeedback.loadError')}
      </p>
    );
  }

  const items = feedbackQuery.data?.feedback ?? [];
  const total = feedbackQuery.data?.total ?? 0;

  return (
    <section aria-labelledby="response-feedback-heading" className="space-y-5">
      <div>
        <h2 id="response-feedback-heading" className="text-2xl font-bold">
          {t('adminPage.responseFeedback.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t('adminPage.responseFeedback.subtitle')}
        </p>
      </div>

      <div className="flex flex-wrap gap-3" aria-label={t('adminPage.responseFeedback.filters')}>
        <label className="text-sm font-medium">
          {t('adminPage.responseFeedback.status')}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminOmniChatResponseFeedbackStatus | '');
              resetSelection();
            }}
            className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
          >
            <option value="">{t('adminPage.responseFeedback.allStatuses')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`adminPage.responseFeedback.statuses.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          {t('adminPage.responseFeedback.reason')}
          <select
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as OmniChatResponseFeedbackReason | '');
              resetSelection();
            }}
            className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
          >
            <option value="">{t('adminPage.responseFeedback.allReasons')}</option>
            {REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`adminPage.responseFeedback.reasons.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)]">
        {t('adminPage.responseFeedback.count', { count: total })}
      </p>

      {items.length === 0 ? (
        <p className="rounded border border-[var(--color-border)] p-5 text-[var(--color-text-secondary)]">
          {t('adminPage.responseFeedback.empty')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.8fr)]">
          <div className="overflow-x-auto rounded border border-[var(--color-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-surface-secondary)]">
                <tr>
                  <th className="p-3">{t('adminPage.responseFeedback.reason')}</th>
                  <th className="p-3">{t('adminPage.responseFeedback.status')}</th>
                  <th className="p-3">{t('adminPage.responseFeedback.submitted')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--color-border)]">
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(item.id);
                          statusMutation.reset();
                        }}
                        className="text-left font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
                      >
                        {t(`adminPage.responseFeedback.reasons.${item.reason}`)}
                      </button>
                    </td>
                    <td className="p-3">
                      {t(`adminPage.responseFeedback.statuses.${item.status}`)}
                    </td>
                    <td className="p-3">{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedId &&
            (detailQuery.isLoading ? (
              <LoadingMessage>{t('adminPage.responseFeedback.loading')}</LoadingMessage>
            ) : detailQuery.isError ? (
              <p
                role="alert"
                className="rounded border border-red-300 bg-red-50 p-4 text-red-800"
              >
                {t('adminPage.responseFeedback.loadError')}
              </p>
            ) : (
              detailQuery.data && (
                <FeedbackDetail
                  feedback={detailQuery.data.feedback}
                  isPending={statusMutation.isPending}
                  error={statusMutation.isError}
                  onStatus={(nextStatus) =>
                    statusMutation.mutate({ id: selectedId, nextStatus })
                  }
                />
              )
            ))}
        </div>
      )}

      <OffsetPaginationControls
        hasPrev={offset > 0}
        hasMore={offset + items.length < total}
        isFetching={feedbackQuery.isFetching}
        onPrev={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
        onNext={() => setOffset((value) => value + PAGE_SIZE)}
        centerContent={
          <span className="text-sm text-[var(--color-text-secondary)]">
            {t('adminPage.responseFeedback.page', {
              page: Math.floor(offset / PAGE_SIZE) + 1,
            })}
          </span>
        }
      />
    </section>
  );
}

interface FeedbackDetailProps {
  feedback: AdminOmniChatResponseFeedbackDetail;
  isPending: boolean;
  error: boolean;
  onStatus: (status: AdminOmniChatResponseFeedbackStatus) => void;
}

function FeedbackDetail({
  feedback,
  isPending,
  error,
  onStatus,
}: FeedbackDetailProps) {
  const { t } = useTranslation();
  const transitions = allowedTransitions(feedback.status);

  return (
    <aside
      aria-label={t('adminPage.responseFeedback.detail')}
      className="rounded border border-[var(--color-border)] p-4 text-sm"
    >
      <h3 className="font-semibold">{t('adminPage.responseFeedback.detail')}</h3>
      <dl className="mt-3 space-y-2">
        <div>
          <dt className="font-medium">{t('adminPage.responseFeedback.reason')}</dt>
          <dd>{t(`adminPage.responseFeedback.reasons.${feedback.reason}`)}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('adminPage.responseFeedback.note')}</dt>
          <dd className="whitespace-pre-wrap">
            {feedback.note || t('adminPage.responseFeedback.noNote')}
          </dd>
        </div>
        <Snapshot
          label={t('adminPage.responseFeedback.responseSnapshot')}
          value={feedback.response_snapshot}
        />
        <Snapshot
          label={t('adminPage.responseFeedback.priorUserSnapshot')}
          value={feedback.prior_user_snapshot}
        />
        <Snapshot
          label={t('adminPage.responseFeedback.sceneFacts')}
          value={prettySnapshot(feedback.scene_state_snapshot)}
        />
      </dl>

      {transitions.length > 0 && (
        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-label={t('adminPage.responseFeedback.actions')}
        >
          {transitions.map((nextStatus) => (
            <button
              type="button"
              key={nextStatus}
              disabled={isPending}
              onClick={() => onStatus(nextStatus)}
              className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t(`adminPage.responseFeedback.statuses.${nextStatus}`)}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {t('adminPage.responseFeedback.updateError')}
        </p>
      )}
    </aside>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd>
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-surface-secondary)] p-2 text-xs">
          {value || t('adminPage.responseFeedback.unavailable')}
        </pre>
      </dd>
    </div>
  );
}
