import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { groupsService } from '../../services/groupsService';
import type { Conversation } from '../../types/messages';
import { GroupAvatar } from './GroupAvatar';

interface User {
  id: number;
  username: string;
  avatar_url?: string | null;
}

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
  searchUsers: (query: string) => Promise<User[]>;
}

type Step = 1 | 2 | 3;

export function CreateGroupModal({ onClose, onCreated, searchUsers }: CreateGroupModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [groupName, setGroupName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [anyoneCanInvite, setAnyoneCanInvite] = useState(false);
  const [anyoneCanPin, setAnyoneCanPin] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      groupsService.createGroup({
        name: groupName.trim(),
        participant_ids: selectedUsers.map((u) => u.id),
        avatar_url: avatarUrl.trim() || undefined,
        description: description.trim() || undefined,
        settings: {
          anyone_can_invite: anyoneCanInvite,
          anyone_can_pin: anyoneCanPin,
          message_history_visible: historyVisible,
        },
      }),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onCreated(conversation);
    },
    onError: () => setError(t('groups.createError')),
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Auto-focus first input on mount
  useEffect(() => { firstInputRef.current?.focus(); }, []);

  // Live search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchUsers(searchQuery);
        // Exclude already selected users
        setSearchResults(results.filter((u) => !selectedUsers.find((s) => s.id === u.id)));
      } catch { /* ignore */ }
      finally { setIsSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedUsers, searchUsers]);

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) => {
      if (prev.find((u) => u.id === user.id)) return prev.filter((u) => u.id !== user.id);
      if (prev.length >= 249) return prev; // max 250 total (creator + 249)
      return [...prev, user];
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!groupName.trim()) { setError(t('groups.nameRequired')); return; }
      setError('');
      setStep(2);
    } else if (step === 2) {
      if (selectedUsers.length < 1) { setError(t('groups.minParticipants')); return; }
      setError('');
      setStep(3);
    } else {
      createMutation.mutate();
    }
  };

  const stepTitles: Record<Step, string> = {
    1: t('groups.step1Title'),
    2: t('groups.step2Title'),
    3: t('groups.step3Title'),
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
                aria-label={t('common.back')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <h2 id={titleId} className="text-sm font-semibold text-[var(--color-text-primary)]">
              {stepTitles[step]}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)]">{step}/3</span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1: Name & Avatar */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <GroupAvatar name={groupName || 'G'} avatarUrl={avatarUrl || null} size={72} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                  {t('groups.nameLabel')} <span className="text-[var(--color-error)] ml-1">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  maxLength={100}
                  placeholder={t('groups.namePlaceholder')}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                  {t('groups.avatarLabel')}
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder={t('groups.avatarPlaceholder')}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                  {t('groups.descriptionLabel')}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={t('groups.descriptionPlaceholder')}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>
          )}

          {/* Step 2: Add Members */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-muted)]">
                {t('groups.selectedCount', { count: selectedUsers.length })} / 249
              </p>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('groups.searchUsersPlaceholder')}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
              {/* Search results */}
              {searchResults.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                  {searchResults.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => toggleUser(user)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-hover)]"
                      >
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-xs text-white font-semibold">
                            {user.username[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-[var(--color-text-primary)]">{user.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {isSearching && (
                <p className="text-xs text-[var(--color-text-muted)]">{t('common.searching')}</p>
              )}
              {/* Selected users */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-1.5 rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-primary)]"
                    >
                      {user.username}
                      <button
                        type="button"
                        onClick={() => toggleUser(user)}
                        aria-label={t('groups.removeUser', { name: user.username })}
                        className="ml-0.5 rounded-full hover:bg-[var(--color-primary)]/20"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Settings */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('groups.reviewSummary', { name: groupName, count: selectedUsers.length + 1 })}
              </p>
              {[
                { label: t('groups.settings.anyoneCanInvite'), value: anyoneCanInvite, onChange: setAnyoneCanInvite },
                { label: t('groups.settings.anyoneCanPin'), value: anyoneCanPin, onChange: setAnyoneCanPin },
                { label: t('groups.settings.historyVisible'), value: historyVisible, onChange: setHistoryVisible },
              ].map(({ label, value, onChange }) => (
                <label key={label} className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value}
                    onClick={() => onChange(!value)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </label>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs font-medium text-[var(--color-error)]" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={createMutation.isPending}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {step === 3
              ? createMutation.isPending
                ? t('groups.creating')
                : t('groups.createButton')
              : t('common.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
