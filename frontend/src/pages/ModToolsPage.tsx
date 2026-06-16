import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { moderationService } from '../services/moderationService';
import { accessRequestService, type AccessRequest } from '../services/accessRequestService';
import { LoadingMessage } from '../components/common/StatusMessage';
import { EmptyState } from '../components/empty';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { modMailService } from '../services/modMailService';
import { useFormat } from '../hooks/useFormat';
import type {
  HubBan,
  CreateBanRequest,
  RemovalReason,
  CreateRemovalReasonRequest,
  ModLog,
} from '../types/moderation';
import type { ModMailConversation } from '../types/modmail';

type TabType = 'bans' | 'removal_reasons' | 'mod_log' | 'mod_mail' | 'requests';

export default function ModToolsPage() {
  const { t } = useTranslation();
  const { hubName } = useParams<{ hubName: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('bans');

  if (!hubName) {
    navigate('/');
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{t('modToolsPage.header.title', { hub: hubName })}</h1>
          <p className="text-[var(--color-text-secondary)] mt-2">
            {t('modToolsPage.header.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate(`/h/${hubName}`)}
            className="px-4 py-2 rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)] transition-colors"
          >
            {t('modToolsPage.actions.exit')}
          </button>
          <button
            onClick={() => navigate(`/h/${hubName}/settings`)}
            className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] transition-colors"
          >
            {t('modToolsPage.actions.hubSettings')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('bans')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'bans'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            {t('modToolsPage.tabs.userBans')}
          </button>
          <button
            onClick={() => setActiveTab('removal_reasons')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'removal_reasons'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            {t('modToolsPage.tabs.removalReasons')}
          </button>
          <button
            onClick={() => setActiveTab('mod_log')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'mod_log'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            {t('modToolsPage.tabs.modLog')}
          </button>
          <button
            onClick={() => setActiveTab('mod_mail')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'mod_mail'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            {t('modToolsPage.tabs.modMail')}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'requests'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-gray-300'
            }`}
          >
            {t('modToolsPage.tabs.requests')}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'bans' && <BansTab hubName={hubName} />}
      {activeTab === 'removal_reasons' && <RemovalReasonsTab hubName={hubName} />}
      {activeTab === 'mod_log' && <ModLogTab hubName={hubName} />}
      {activeTab === 'mod_mail' && <ModMailTab hubName={hubName} />}
      {activeTab === 'requests' && <AccessRequestsTab hubName={hubName} />}
    </div>
  );
}

// ===== BANS TAB =====

function BansTab({ hubName }: { hubName: string }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: bans, isLoading } = useQuery({
    queryKey: ['bannedUsers', hubName],
    queryFn: () => moderationService.getBannedUsers(hubName),
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: number) => moderationService.unbanUser(hubName, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedUsers', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>{t('common.loading')}</LoadingMessage>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{t('modToolsPage.bans.title')}</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90"
        >
          {showAddForm ? t('common.cancel') : t('modToolsPage.bans.actions.banUser')}
        </button>
      </div>

      {showAddForm && (
        <AddBanForm
          hubName={hubName}
          onSuccess={() => {
            setShowAddForm(false);
            queryClient.invalidateQueries({ queryKey: ['bannedUsers', hubName] });
          }}
        />
      )}

      {bans && bans.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-surface-elevated)] mb-4">
            <svg
              className="w-8 h-8 text-[var(--color-text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            {t('modToolsPage.bans.empty.title')}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto mb-4">
            {t('modToolsPage.bans.empty.description')}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('modToolsPage.bans.empty.help')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {bans?.map((ban: HubBan) => (
          <div
            key={ban.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">
                  {ban.username || t('common.userNumber', { id: ban.user_id })}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  {ban.reason || t('modToolsPage.bans.noReason')}
                </div>
                {ban.note && (
                  <div className="text-xs text-[var(--color-text-secondary)] mt-1 italic">
                    {t('modToolsPage.bans.modNote', { note: ban.note })}
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-secondary)] mt-2">
                  {ban.ban_type === 'permanent' ? (
                    <span className="text-red-600 font-medium">
                      {t('modToolsPage.bans.permanent')}
                    </span>
                  ) : (
                    <span>
                      {t('modToolsPage.bans.temporaryUntil', {
                        date: formatDate(ban.expires_at!, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      })}
                    </span>
                  )}
                  {' • '}
                  {t('modToolsPage.bans.bannedByOn', {
                    moderator: ban.banned_by_name || `#${ban.banned_by}`,
                    date: formatDate(ban.created_at, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }),
                  })}
                </div>
              </div>
              <button
                onClick={() => unbanMutation.mutate(ban.user_id)}
                disabled={unbanMutation.isPending}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {t('modToolsPage.bans.actions.unban')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddBanForm({ hubName, onSuccess }: { hubName: string; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [banType, setBanType] = useState<'permanent' | 'temporary'>('permanent');
  const [expiresAt, setExpiresAt] = useState('');

  const banMutation = useMutation({
    mutationFn: (data: CreateBanRequest) => moderationService.banUser(hubName, data),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      alert(t('modToolsPage.bans.form.errors.invalidUserId'));
      return;
    }

    if (banType === 'temporary' && !expiresAt) {
      alert(t('modToolsPage.bans.form.errors.expirationRequired'));
      return;
    }

    banMutation.mutate({
      user_id: userIdNum,
      reason: reason || undefined,
      note: note || undefined,
      ban_type: banType,
      expires_at: banType === 'temporary' ? expiresAt : undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]"
    >
      <h3 className="font-medium mb-4">{t('modToolsPage.bans.form.title')}</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('modToolsPage.bans.form.fields.userId.label')}{' '}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t('modToolsPage.bans.form.fields.banType.label')}
          </label>
          <select
            value={banType}
            onChange={(e) => setBanType(e.target.value as 'permanent' | 'temporary')}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
          >
            <option value="permanent">
              {t('modToolsPage.bans.form.fields.banType.permanent')}
            </option>
            <option value="temporary">
              {t('modToolsPage.bans.form.fields.banType.temporary')}
            </option>
          </select>
        </div>

        {banType === 'temporary' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('modToolsPage.bans.form.fields.expiresAt.label')}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
              required={banType === 'temporary'}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            {t('modToolsPage.bans.form.fields.reason.label')}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            rows={2}
            placeholder={t('modToolsPage.bans.form.fields.reason.placeholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t('modToolsPage.bans.form.fields.note.label')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            rows={2}
            placeholder={t('modToolsPage.bans.form.fields.note.placeholder')}
          />
        </div>

        <button
          type="submit"
          disabled={banMutation.isPending}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {banMutation.isPending
            ? t('modToolsPage.bans.form.actions.banning')
            : t('modToolsPage.bans.actions.banUser')}
        </button>
      </div>
    </form>
  );
}

// ===== REMOVAL REASONS TAB =====

function RemovalReasonsTab({ hubName }: { hubName: string }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingReason, setEditingReason] = useState<RemovalReason | null>(null);

  const { data: reasons, isLoading } = useQuery({
    queryKey: ['removalReasons', hubName],
    queryFn: () => moderationService.getRemovalReasons(hubName),
  });

  const deleteMutation = useMutation({
    mutationFn: (reasonId: number) => moderationService.deleteRemovalReason(reasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['removalReasons', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>{t('common.loading')}</LoadingMessage>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{t('modToolsPage.removalReasons.title')}</h2>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setEditingReason(null);
          }}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90"
        >
          {showAddForm ? t('common.cancel') : t('modToolsPage.removalReasons.addTemplate')}
        </button>
      </div>

      {(showAddForm || editingReason) && (
        <RemovalReasonForm
          hubName={hubName}
          reason={editingReason}
          onSuccess={() => {
            setShowAddForm(false);
            setEditingReason(null);
            queryClient.invalidateQueries({ queryKey: ['removalReasons', hubName] });
          }}
          onCancel={() => {
            setShowAddForm(false);
            setEditingReason(null);
          }}
        />
      )}

      {reasons && reasons.length === 0 && (
        <div className="text-center py-12">
          <EmptyState illustration="noData" title={t('modToolsPage.removalReasons.empty')} />
        </div>
      )}

      <div className="space-y-3">
        {reasons?.map((reason: RemovalReason) => (
          <div
            key={reason.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium">{reason.title}</div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  {reason.message}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)] mt-2">
                  {t('modToolsPage.removalReasons.lastUpdated', {
                    date: formatDate(reason.updated_at, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }),
                  })}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setEditingReason(reason)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(t('modToolsPage.removalReasons.confirmDelete'))) {
                      deleteMutation.mutate(reason.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RemovalReasonForm({
  hubName,
  reason,
  onSuccess,
  onCancel,
}: {
  hubName: string;
  reason: RemovalReason | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(reason?.title || '');
  const [message, setMessage] = useState(reason?.message || '');

  const createMutation = useMutation({
    mutationFn: (data: CreateRemovalReasonRequest) =>
      moderationService.createRemovalReason(hubName, data),
    onSuccess,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; title: string; message: string }) =>
      moderationService.updateRemovalReason(data.id, { title: data.title, message: data.message }),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (reason) {
      updateMutation.mutate({ id: reason.id, title, message });
    } else {
      createMutation.mutate({ title, message });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]"
    >
      <h3 className="font-medium mb-4">
        {reason
          ? t('modToolsPage.removalReasons.form.editTitle')
          : t('modToolsPage.removalReasons.form.createTitle')}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('modToolsPage.removalReasons.form.fields.title.label')}{' '}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            maxLength={100}
            required
            placeholder={t('modToolsPage.removalReasons.form.fields.title.placeholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {t('modToolsPage.removalReasons.form.fields.message.label')}{' '}
            <span className="text-red-500">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg"
            rows={3}
            required
            placeholder={t('modToolsPage.removalReasons.form.fields.message.placeholder')}
          />
        </div>

        <div className="flex space-x-2">
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="flex-1 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending || updateMutation.isPending
              ? t('modToolsPage.removalReasons.form.saving')
              : t('common.save')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-elevated)]"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </form>
  );
}

// ===== MOD LOG TAB =====

function ModLogTab({ hubName }: { hubName: string }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const [cursorStack, setCursorStack] = useState(['']);
  const limit = 50;
  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';

  useEffect(() => {
    setCursorStack(['']);
  }, [hubName]);

  const { data, isLoading } = useQuery({
    queryKey: ['modLog', hubName, currentCursor],
    queryFn: () => moderationService.getModLog(hubName, limit, 0, currentCursor),
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>{t('common.loading')}</LoadingMessage>
      </div>
    );
  }

  const logs = data?.logs || [];
  const hasMore = Boolean(data?.next_cursor) || logs.length >= limit;
  const hasPrev = cursorStack.length > 1;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">{t('modToolsPage.modLog.title')}</h2>

      {logs.length === 0 && (
        <div className="text-center py-12 px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-surface-elevated)] mb-4">
            <svg
              className="w-8 h-8 text-[var(--color-text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            {t('modToolsPage.modLog.empty.title')}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto">
            {t('modToolsPage.modLog.empty.description')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {logs.map((log: ModLog) => (
          <div
            key={log.id}
            className="p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-sm"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="font-medium">
                  {log.moderator_name ||
                    t('modToolsPage.modLog.moderatorFallback', { id: log.moderator_id })}
                </span>
                <span className="text-[var(--color-text-secondary)]">
                  {' '}
                  {getActionDescription(t, log)}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-secondary)]">
                {formatDate(log.created_at, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            </div>
            {log.details && Object.keys(log.details).length > 0 && (
              <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                {JSON.stringify(log.details, null, 2)}
              </div>
            )}
          </div>
        ))}
      </div>

      {logs.length > 0 && (
        <OffsetPaginationControls
          showDivider={false}
          className="mt-6 justify-center gap-4"
          hasPrev={hasPrev}
          hasMore={hasMore}
          onPrev={() => setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
          onNext={() => {
            const nextCursor = data?.next_cursor;
            if (nextCursor) {
              setCursorStack((prev) => [...prev, nextCursor]);
            }
          }}
          centerContent={
            <span className="px-4 py-2">
              {t('searchPage.pagination.page', { page: cursorStack.length })}
            </span>
          }
        />
      )}
    </div>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function getActionDescription(t: Translate, log: ModLog): string {
  const action = t(`modToolsPage.modLog.actions.${log.action}`, {
    defaultValue: String(log.action),
  });

  if (log.target_type && log.target_id) {
    return t('modToolsPage.modLog.actionWithTarget', {
      action,
      type: log.target_type,
      id: log.target_id,
    });
  }

  return action;
}

// ===== MOD MAIL TAB =====

function ModMailTab({ hubName }: { hubName: string }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'open' | 'archived' | 'resolved' | 'all'>(
    'open'
  );

  const { data, isLoading } = useQuery({
    queryKey: ['modMail', hubName, statusFilter],
    queryFn: () => modMailService.getHubModMail(hubName, statusFilter),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      conversationId,
      status,
    }: {
      conversationId: number;
      status: 'open' | 'archived' | 'resolved';
    }) => modMailService.updateStatus(conversationId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modMail', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>{t('modToolsPage.modMail.loading')}</LoadingMessage>
      </div>
    );
  }

  const conversations = data?.conversations || [];
  const statusLabelWithSpace =
    statusFilter === 'all' ? '' : `${t(`modToolsPage.modMail.status.${statusFilter}`)} `;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{t('modToolsPage.modMail.title')}</h2>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'open' | 'archived' | 'resolved' | 'all')
          }
          className="px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
        >
          <option value="open">{t('modToolsPage.modMail.status.open')}</option>
          <option value="archived">{t('modToolsPage.modMail.status.archived')}</option>
          <option value="resolved">{t('modToolsPage.modMail.status.resolved')}</option>
          <option value="all">{t('modToolsPage.modMail.status.all')}</option>
        </select>
      </div>

      {conversations.length === 0 && (
        <div className="text-center py-12">
          <EmptyState
            illustration="noData"
            title={t('modToolsPage.modMail.empty', { status: statusLabelWithSpace })}
          />
        </div>
      )}

      <div className="space-y-3">
        {conversations.map((conv: ModMailConversation) => (
          <div
            key={conv.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/mod-mail/${conv.id}`)}
                    className="text-lg font-medium hover:text-[var(--color-primary)]"
                  >
                    {conv.subject}
                  </button>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      conv.status === 'open'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : conv.status === 'resolved'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {t(`modToolsPage.modMail.statusBadge.${conv.status}`, {
                      defaultValue: conv.status,
                    })}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                      {t('modToolsPage.modMail.unread', { count: conv.unread_count })}
                    </span>
                  )}
                </div>
                <div className="text-sm text-[var(--color-text-secondary)] mt-1">
                  <span>
                    {t('modToolsPage.modMail.from', {
                      username:
                        conv.participants.find((p) => !p.is_moderator)?.username ||
                        t('modToolsPage.common.unknown'),
                    })}
                  </span>
                  <span className="mx-2">•</span>
                  <span>
                    {formatDate(conv.created_at, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {conv.latest_message && (
                    <>
                      <span className="mx-2">•</span>
                      <span>
                        {t('modToolsPage.modMail.lastReply', {
                          date: formatDate(conv.latest_message.sent_at, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }),
                        })}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="ml-4 flex gap-2">
                {conv.status === 'open' && (
                  <>
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ conversationId: conv.id, status: 'resolved' })
                      }
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      disabled={updateStatusMutation.isPending}
                    >
                      {t('modToolsPage.modMail.actions.resolve')}
                    </button>
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ conversationId: conv.id, status: 'archived' })
                      }
                      className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                      disabled={updateStatusMutation.isPending}
                    >
                      {t('modToolsPage.modMail.actions.archive')}
                    </button>
                  </>
                )}
                {conv.status !== 'open' && (
                  <button
                    onClick={() =>
                      updateStatusMutation.mutate({ conversationId: conv.id, status: 'open' })
                    }
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    disabled={updateStatusMutation.isPending}
                  >
                    {t('modToolsPage.modMail.actions.reopen')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== ACCESS REQUESTS TAB =====

function AccessRequestsTab({ hubName }: { hubName: string }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();
  const [usernameInput, setUsernameInput] = useState('');
  const [addUserStatus, setAddUserStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle'
  );
  const [addUserError, setAddUserError] = useState('');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['accessRequests', hubName],
    queryFn: () => accessRequestService.getPendingRequests(hubName),
  });

  const addUserMutation = useMutation({
    mutationFn: (username: string) => accessRequestService.addUserAccess(hubName, username),
    onSuccess: () => {
      setAddUserStatus('success');
      setUsernameInput('');
      queryClient.invalidateQueries({ queryKey: ['accessRequests', hubName] });
    },
    onError: (error: Error) => {
      setAddUserStatus('error');
      setAddUserError(error.message || t('modToolsPage.requests.errors.grantFailed'));
    },
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: number) => accessRequestService.approveRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessRequests', hubName] });
    },
  });

  const denyMutation = useMutation({
    mutationFn: (requestId: number) => accessRequestService.denyRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessRequests', hubName] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>{t('common.loading')}</LoadingMessage>
      </div>
    );
  }

  const pendingRequests = requests?.requests || [];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">{t('modToolsPage.requests.title')}</h2>

      <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t('modToolsPage.requests.grantByUsername.title')}
        </h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t('modToolsPage.requests.grantByUsername.description')}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = usernameInput.trim();
            if (!trimmed) return;
            setAddUserStatus('saving');
            setAddUserError('');
            addUserMutation.mutate(trimmed);
          }}
          className="mt-3 flex flex-col gap-3 md:flex-row"
        >
          <input
            type="text"
            value={usernameInput}
            onChange={(event) => {
              setUsernameInput(event.target.value);
              if (addUserStatus !== 'idle') {
                setAddUserStatus('idle');
              }
            }}
            placeholder={t('modToolsPage.requests.grantByUsername.placeholder')}
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <button
            type="submit"
            disabled={addUserMutation.isPending || usernameInput.trim().length === 0}
            className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addUserMutation.isPending
              ? t('modToolsPage.requests.grantByUsername.granting')
              : t('modToolsPage.requests.grantByUsername.grantButton')}
          </button>
        </form>
        {addUserStatus === 'success' && (
          <p className="mt-2 text-sm text-green-600">
            {t('modToolsPage.requests.grantByUsername.success')}
          </p>
        )}
        {addUserStatus === 'error' && <p className="mt-2 text-sm text-red-600">{addUserError}</p>}
      </div>

      {pendingRequests.length === 0 && (
        <div className="text-center py-12">
          <EmptyState illustration="noData" title={t('modToolsPage.requests.empty')} />
        </div>
      )}

      <div className="space-y-3">
        {pendingRequests.map((request: AccessRequest) => (
          <div
            key={request.id}
            className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)]"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {request.username || t('common.userNumber', { id: request.user_id })}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded">
                    {t('modToolsPage.requests.status.pending')}
                  </span>
                </div>
                {request.message && (
                  <div className="text-sm text-[var(--color-text-secondary)] mt-2 p-3 bg-[var(--color-surface)] rounded border border-[var(--color-border)]">
                    "{request.message}"
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-secondary)] mt-2">
                  {t('modToolsPage.requests.requestedOn', {
                    date: formatDate(request.created_at, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }),
                  })}
                </div>
              </div>
              <div className="ml-4 flex gap-2">
                <button
                  onClick={() => {
                    if (window.confirm(t('modToolsPage.requests.confirmApprove'))) {
                      approveMutation.mutate(request.id);
                    }
                  }}
                  disabled={approveMutation.isPending || denyMutation.isPending}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {t('modToolsPage.requests.actions.approve')}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(t('modToolsPage.requests.confirmDeny'))) {
                      denyMutation.mutate(request.id);
                    }
                  }}
                  disabled={approveMutation.isPending || denyMutation.isPending}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {t('modToolsPage.requests.actions.deny')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
