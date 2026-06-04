import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import ThemeSelector from '../components/themes/ThemeSelector';
import ThemeEditor from '../components/themes/ThemeEditor';
import { LanguageSelector } from '../components/settings/LanguageSelector';
import { Panel } from '../components/common/Panel';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { getOwnPublicKeyBase64 } from '../services/keyManagementService';
import { usersService } from '../services/usersService';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { accountService } from '../services/accountService';
import { userSettingsService } from '../services/userSettingsService';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { FEATURE_FLAGS } from '../config/featureFlags';
import type { AutoDeleteDuration } from '../types/messages';
import { secondsToDuration, durationToSeconds, isDurationNever } from '../types/messages';
import { AutoDeleteDurationPicker } from '../components/messages/AutoDeleteDurationPicker';
import {
  getForcedDocumentDirection,
  setForcedDocumentDirection,
  syncDocumentLanguageAttributes,
  type DocumentDirection,
} from '../i18n/languageUtils';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const {
    useRelativeTime,
    setUseRelativeTime,
    autoCloseThemeSelector,
    setAutoCloseThemeSelector,
    notifyArchivedMessages,
    setNotifyArchivedMessages,
    autoUnarchiveOnMessage,
    setAutoUnarchiveOnMessage,
    notifyRemovedSavedPosts,
    setNotifyRemovedSavedPosts,
    defaultOmniPostsOnly,
    setDefaultOmniPostsOnly,
    stayOnPostAfterHide,
    setStayOnPostAfterHide,
    useInfiniteScrollHome,
    setUseInfiniteScrollHome,
    useInfiniteScrollHubs,
    setUseInfiniteScrollHubs,
    useInfiniteScrollSubs,
    setUseInfiniteScrollSubs,
    searchIncludeNsfwByDefault,
    setSearchIncludeNsfwByDefault,
    blockAllNsfw,
    setBlockAllNsfw,
    blockNsfwThumbnails,
    setBlockNsfwThumbnails,
    accessRequestCooldownDisplay,
    setAccessRequestCooldownDisplay,
    fontSize,
    setFontSize,
    transcriptionOptIn,
    setTranscriptionOptIn,
    micDeviceId,
    setMicDeviceId,
    cameraDeviceId,
    setCameraDeviceId,
    speakerDeviceId,
    setSpeakerDeviceId,
    quietHoursEnabled,
    setQuietHoursEnabled,
    quietHoursStartMinutes,
    setQuietHoursStartMinutes,
    quietHoursEndMinutes,
    setQuietHoursEndMinutes,
    quietHoursTimezone,
    batchNotifications,
    setBatchNotifications,
    readReceipts,
    setReadReceipts,
    typingIndicators,
    setTypingIndicators,
    showLastSeen,
    setShowLastSeen,
    profileVisibility,
    setProfileVisibility,
    notificationSound,
    setNotificationSound,
    showPushNotifications,
    setShowPushNotifications,
    notifyCommentReplies,
    setNotifyCommentReplies,
    notifyPostMilestone,
    setNotifyPostMilestone,
    notifyPostVelocity,
    setNotifyPostVelocity,
    notifyCommentMilestone,
    setNotifyCommentMilestone,
    notifyCommentVelocity,
    setNotifyCommentVelocity,
    dailyDigest,
    setDailyDigest,
  } = useSettings();

  type SettingsTab = 'general' | 'notifications' | 'privacy' | 'appearance' | 'audio_video';
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabItems = useMemo(
    () =>
      [
        { key: 'general' as const, label: t('settings.tabs.general') },
        { key: 'notifications' as const, label: t('settings.tabs.notifications') },
        { key: 'privacy' as const, label: t('settings.tabs.privacy') },
        { key: 'appearance' as const, label: t('settings.tabs.appearance') },
        { key: 'audio_video' as const, label: t('settings.tabs.audioVideo') },
      ] satisfies Array<{ key: SettingsTab; label: string }>,
    [t]
  );

  const minutesToTimeValue = (minutes: number): string => {
    const m = Math.max(0, Math.min(1439, minutes));
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const timeValueToMinutes = (value: string): number => {
    const [hh, mm] = value.split(':').map((v) => Number.parseInt(v, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
    return Math.max(0, Math.min(1439, hh * 60 + mm));
  };
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [showPublicKey, setShowPublicKey] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const { user, refreshUser } = useAuth();
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailConfirmInput, setEmailConfirmInput] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [devDirectionOverride, setDevDirectionOverride] = useState<'auto' | DocumentDirection>(() => {
    const forcedDirection = getForcedDocumentDirection();
    return forcedDirection ?? 'auto';
  });

  // Global auto-delete
  const { data: rawSettings } = useQuery({
    queryKey: ['user-settings-raw'],
    queryFn: () => userSettingsService.get(),
  });
  // Convert nanosecond integer (Go time.Duration JSON) to total seconds.
  const nsToSeconds = (ns: number | null | undefined): number =>
    ns != null ? Math.floor(ns / 1e9) : 0;

  const savedGlobalSeconds = nsToSeconds(rawSettings?.default_auto_delete_after);
  const savedGlobalDuration = secondsToDuration(savedGlobalSeconds);
  const [globalDuration, setGlobalDuration] = useState<AutoDeleteDuration>({ days: 0, hours: 0, minutes: 0 });
  const [pendingGlobalSeconds, setPendingGlobalSeconds] = useState<number | null>(null);
  useEffect(() => {
    setGlobalDuration(savedGlobalDuration);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedGlobalSeconds]);
  const saveGlobalAutoDeleteMutation = useMutation({
    mutationFn: ({ seconds, retroactive }: { seconds: number; retroactive: boolean }) =>
      userSettingsService.update({ default_auto_delete_seconds: seconds, auto_delete_apply_retroactive: retroactive }),
    onSuccess: () => {
      setPendingGlobalSeconds(null);
    },
    onError: () => {
      setPendingGlobalSeconds(null);
    },
  });
  const selectedGlobalSeconds = durationToSeconds(globalDuration);
  const globalIsDirty = selectedGlobalSeconds !== savedGlobalSeconds;
  const handleGlobalAutoDeleteSave = () => {
    if (!globalIsDirty) return;
    if (isDurationNever(globalDuration)) {
      saveGlobalAutoDeleteMutation.mutate({ seconds: 0, retroactive: false });
    } else {
      setPendingGlobalSeconds(selectedGlobalSeconds);
    }
  };

  // Data Export (P0-016)
  const [isRequestingExport, setIsRequestingExport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportPassword, setExportPassword] = useState('');

  // Feature Flags (P0-012: Demonstrate feature flag integration)
  const voiceCallsEnabled = useFeatureFlag(FEATURE_FLAGS.VOICE_CALLS);
  const videoCallsEnabled = useFeatureFlag(FEATURE_FLAGS.VIDEO_CALLS);
  const lazyLoadImagesEnabled = useFeatureFlag(FEATURE_FLAGS.LAZY_LOAD_IMAGES);

  // Push Notifications
  const {
    isSupported: pushSupported,
    isRegistered: pushEnabled,
    requestPermission: enablePush,
    unregister: disablePush,
  } = usePushNotifications();

  const handleTogglePushNotifications = async () => {
    if (!pushSupported) {
      return;
    }

    if (showPushNotifications) {
      const unregistered = await disablePush();
      if (unregistered) {
        setShowPushNotifications(false);
      }
      return;
    }

    const enabled = pushEnabled ? true : await enablePush();
    setShowPushNotifications(enabled);
  };

  // Track if we've already processed email verification to prevent infinite loop
  const hasProcessedVerification = useRef(false);

  // Refresh user data if arriving from email verification
  useEffect(() => {
    const state = location.state as { emailVerified?: boolean } | null;
    if (state?.emailVerified && !hasProcessedVerification.current) {
      console.log('[SettingsPage] Email just verified, refreshing user data...');
      hasProcessedVerification.current = true;
      refreshUser();
      // Clear the state flag so it doesn't persist in history
      window.history.replaceState({}, document.title);
    }
  }, [location.state, refreshUser]);

  useEffect(() => {
    setPublicKey(getOwnPublicKeyBase64());
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    setForcedDocumentDirection(devDirectionOverride === 'auto' ? null : devDirectionOverride);
    syncDocumentLanguageAttributes(i18n.resolvedLanguage || i18n.language || 'en');
  }, [devDirectionOverride, i18n.language, i18n.resolvedLanguage]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    let cancelled = false;

    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setMicrophones(devices.filter((d) => d.kind === 'audioinput'));
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
        setSpeakers(devices.filter((d) => d.kind === 'audiooutput'));
      } catch (error) {
        if (!cancelled) {
          console.warn('[SettingsPage] Failed to enumerate media devices:', error);
        }
      }
    };

    void loadDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', loadDevices);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', loadDevices);
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          {t('settings.title')}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t('settings.subtitle')}</p>
      </div>

      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label={t('settings.title')}>
        {tabItems.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        <div hidden={activeTab !== 'appearance'}>
          {/* SETTINGS-5: Category header for Appearance */}
          <div className="border-b border-[var(--color-border)] pb-2">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {t('settings.categories.appearance')}
            </h2>
          </div>

          {/* Theme Selection */}
          <Panel as="section">
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.themeSection.title')}
            </h3>
            <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
              {t('settings.themeSection.description')}
            </p>
            <ThemeSelector onCreateNewTheme={() => setIsThemeEditorOpen(true)} />
          </Panel>

          <Panel as="section">
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.appearancePreferences.fontSizeTitle')}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.appearancePreferences.fontSizeHelp')}
            </p>
            <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <label
                htmlFor="font-size"
                className="block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('settings.appearancePreferences.fontSizeLabel')}
              </label>
              <select
                id="font-size"
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as 'small' | 'medium' | 'large')}
                className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="small">{t('settings.appearancePreferences.fontSizeSmall')}</option>
                <option value="medium">{t('settings.appearancePreferences.fontSizeMedium')}</option>
                <option value="large">{t('settings.appearancePreferences.fontSizeLarge')}</option>
              </select>
            </div>
          </Panel>
        </div>

        {/* Language Selection */}
        <div hidden={activeTab !== 'general'}>
          <Panel as="section">
            <LanguageSelector />
          </Panel>
          {import.meta.env.DEV && (
            <Panel as="section">
              <h3 className="mb-2 text-base font-semibold text-[var(--color-text-primary)]">
                {t('settings.devRtl.title')}
              </h3>
              <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
                {t('settings.devRtl.description')}
              </p>
              <div className="flex flex-wrap gap-2">
                {(['auto', 'ltr', 'rtl'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDevDirectionOverride(value)}
                    className={`rounded border px-3 py-1 text-xs font-semibold ${
                      devDirectionOverride === value
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
                    }`}
                  >
                    {t(`settings.devRtl.options.${value}`)}
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div hidden={activeTab !== 'notifications'}>
          {/* SETTINGS-5: Category header for Notifications */}
          <div className="border-b border-[var(--color-border)] pb-2 pt-4">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {t('settings.categories.notifications')}
            </h2>
          </div>

          {/* Messaging Notifications */}
          <Panel as="section">
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.archivedNotifications.title')}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.archivedNotifications.description')}
            </p>

            <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.archivedNotifications.toggleLabel')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.archivedNotifications.toggleHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifyArchivedMessages}
                onClick={() => setNotifyArchivedMessages(!notifyArchivedMessages)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  notifyArchivedMessages ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">
                  {t('common.accessibility.toggleArchivedNotifications')}
                </span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    notifyArchivedMessages ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </Panel>

          {/* Push Notifications */}
          <Panel as="section">
          <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.pushNotificationsSection.title')}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.pushNotificationsSection.description')}
          </p>

          {!pushSupported && (
            <div className="mt-4 rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4 border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {t('settings.pushNotificationsSection.notSupported')}
              </p>
            </div>
          )}

          {pushSupported && (
            <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.pushNotificationsSection.toggleLabel')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {showPushNotifications
                    ? t('settings.pushNotificationsSection.toggleHelpOn')
                    : t('settings.pushNotificationsSection.toggleHelpOff')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showPushNotifications}
                onClick={() => {
                  void handleTogglePushNotifications();
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  showPushNotifications ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('common.accessibility.togglePushNotifications')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showPushNotifications ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
          </Panel>

          <Panel as="section">
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.quietHours.title')}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.quietHours.description')}
            </p>

            <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.quietHours.toggle')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.quietHours.timezone', { tz: quietHoursTimezone })}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={quietHoursEnabled}
                onClick={() => setQuietHoursEnabled(!quietHoursEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  quietHoursEnabled ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('settings.quietHours.toggle')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    quietHoursEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${quietHoursEnabled ? '' : 'opacity-60'}`}>
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <label
                  htmlFor="quiet-hours-start"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.quietHours.start')}
                </label>
                <input
                  id="quiet-hours-start"
                  type="time"
                  value={minutesToTimeValue(quietHoursStartMinutes)}
                  disabled={!quietHoursEnabled}
                  onChange={(e) => setQuietHoursStartMinutes(timeValueToMinutes(e.target.value))}
                  className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <label
                  htmlFor="quiet-hours-end"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.quietHours.end')}
                </label>
                <input
                  id="quiet-hours-end"
                  type="time"
                  value={minutesToTimeValue(quietHoursEndMinutes)}
                  disabled={!quietHoursEnabled}
                  onChange={(e) => setQuietHoursEndMinutes(timeValueToMinutes(e.target.value))}
                  className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>
          </Panel>

          <Panel as="section">
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.notificationPreferences.title')}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.notificationPreferences.description')}
            </p>

            <div className="mt-4 space-y-4">
              {[
                {
                  key: 'batch-notifications',
                  label: t('settings.notificationPreferences.batchNotifications'),
                  help: t('settings.notificationPreferences.batchNotificationsHelp'),
                  value: batchNotifications,
                  onToggle: () => setBatchNotifications(!batchNotifications),
                },
                {
                  key: 'notify-comment-replies',
                  label: t('settings.notificationPreferences.commentReplies'),
                  help: t('settings.notificationPreferences.commentRepliesHelp'),
                  value: notifyCommentReplies,
                  onToggle: () => setNotifyCommentReplies(!notifyCommentReplies),
                },
                {
                  key: 'notify-post-milestone',
                  label: t('settings.notificationPreferences.postMilestones'),
                  help: t('settings.notificationPreferences.postMilestonesHelp'),
                  value: notifyPostMilestone,
                  onToggle: () => setNotifyPostMilestone(!notifyPostMilestone),
                },
                {
                  key: 'notify-post-velocity',
                  label: t('settings.notificationPreferences.postVelocity'),
                  help: t('settings.notificationPreferences.postVelocityHelp'),
                  value: notifyPostVelocity,
                  onToggle: () => setNotifyPostVelocity(!notifyPostVelocity),
                },
                {
                  key: 'notify-comment-milestone',
                  label: t('settings.notificationPreferences.commentMilestones'),
                  help: t('settings.notificationPreferences.commentMilestonesHelp'),
                  value: notifyCommentMilestone,
                  onToggle: () => setNotifyCommentMilestone(!notifyCommentMilestone),
                },
                {
                  key: 'notify-comment-velocity',
                  label: t('settings.notificationPreferences.commentVelocity'),
                  help: t('settings.notificationPreferences.commentVelocityHelp'),
                  value: notifyCommentVelocity,
                  onToggle: () => setNotifyCommentVelocity(!notifyCommentVelocity),
                },
                {
                  key: 'daily-digest',
                  label: t('settings.notificationPreferences.dailyDigest'),
                  help: t('settings.notificationPreferences.dailyDigestHelp'),
                  value: dailyDigest,
                  onToggle: () => setDailyDigest(!dailyDigest),
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4"
                >
                  <div className="pr-4">
                    <p className="text-base font-semibold text-[var(--color-text-primary)]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.help}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.value}
                    onClick={item.onToggle}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                      item.value ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                    }`}
                  >
                    <span className="sr-only">{item.label}</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        item.value ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Messaging Settings */}
        <div hidden={activeTab !== 'privacy'}>
          <Panel as="section">
          <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.messagingPrivacy.title')}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.messagingPrivacy.description')}
          </p>

          <div className="mt-4 space-y-4">
            {/* Read Receipts Toggle */}
            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.messagingPrivacy.readReceipts')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.messagingPrivacy.readReceiptsHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={readReceipts}
                onClick={() => setReadReceipts(!readReceipts)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  readReceipts ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('common.accessibility.toggleReadReceipts')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    readReceipts ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Typing Indicators Toggle */}
            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.messagingPrivacy.typingIndicators')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.messagingPrivacy.typingIndicatorsHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={typingIndicators}
                onClick={() => setTypingIndicators(!typingIndicators)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  typingIndicators ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('common.accessibility.toggleTypingIndicators')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    typingIndicators ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.messagingPrivacy.autoUnarchiveOnMessage')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.messagingPrivacy.autoUnarchiveOnMessageHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoUnarchiveOnMessage}
                onClick={() => setAutoUnarchiveOnMessage(!autoUnarchiveOnMessage)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  autoUnarchiveOnMessage ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('settings.messagingPrivacy.autoUnarchiveOnMessage')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoUnarchiveOnMessage ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Notification Sound Toggle */}
            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.messagingPrivacy.notificationSound')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.messagingPrivacy.notificationSoundHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationSound}
                onClick={() => setNotificationSound(!notificationSound)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  notificationSound ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('common.accessibility.toggleNotificationSound')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    notificationSound ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Last Seen Toggle */}
            <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.messagingPrivacy.lastSeen')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.messagingPrivacy.lastSeenHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showLastSeen}
                onClick={() => setShowLastSeen(!showLastSeen)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  showLastSeen ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('common.accessibility.toggleLastSeen')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showLastSeen ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <label
                htmlFor="profile-visibility"
                className="block text-base font-semibold text-[var(--color-text-primary)]"
              >
                {t('settings.messagingPrivacy.profileVisibility')}
              </label>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {t('settings.messagingPrivacy.profileVisibilityHelp')}
              </p>
              <select
                id="profile-visibility"
                value={profileVisibility}
                onChange={(e) =>
                  setProfileVisibility(e.target.value as 'public' | 'friends_only' | 'private')
                }
                className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="public">{t('settings.messagingPrivacy.profileVisibilityPublic')}</option>
                <option value="friends_only">
                  {t('settings.messagingPrivacy.profileVisibilityFriendsOnly')}
                </option>
                <option value="private">
                  {t('settings.messagingPrivacy.profileVisibilityPrivate')}
                </option>
              </select>
            </div>

            {/* Global Auto-Delete */}
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">
                {t('messages.autoDelete.label')}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)] mb-4">
                {t('messages.autoDelete.description')}
              </p>
              <AutoDeleteDurationPicker
                value={globalDuration}
                onChange={setGlobalDuration}
                disabled={saveGlobalAutoDeleteMutation.isPending}
              />
              <button
                type="button"
                onClick={handleGlobalAutoDeleteSave}
                disabled={!globalIsDirty || saveGlobalAutoDeleteMutation.isPending}
                className="mt-4 w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
          </Panel>
        </div>

        {/* Global auto-delete retroactive confirm */}
        {pendingGlobalSeconds !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
                {t('messages.autoDelete.applyRetroTitle')}
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                {t('messages.autoDelete.applyRetroBody')}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => saveGlobalAutoDeleteMutation.mutate({ seconds: pendingGlobalSeconds, retroactive: true })}
                  disabled={saveGlobalAutoDeleteMutation.isPending}
                  className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {t('messages.autoDelete.applyToAll')}
                </button>
                <button
                  type="button"
                  onClick={() => saveGlobalAutoDeleteMutation.mutate({ seconds: pendingGlobalSeconds, retroactive: false })}
                  disabled={saveGlobalAutoDeleteMutation.isPending}
                  className="w-full rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
                >
                  {t('messages.autoDelete.applyNewOnly')}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingGlobalSeconds(null)}
                  className="w-full rounded-md px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div hidden={activeTab !== 'general'}>
          {/* SETTINGS-5: Category header for Preferences */}
          <div className="border-b border-[var(--color-border)] pb-2 pt-4">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {t('settings.categories.preferences')}
            </h2>
          </div>

          {/* Date & Time Settings */}
          <Panel as="section">
          <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.dateTime.title')}
          </h3>

          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label
                  htmlFor="relative-time-toggle"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.dateTime.useRelativeTime')}
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.dateTime.useRelativeTimeHelp')}
                </p>
                <div className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    <strong>{t('settings.dateTime.previewLabel')}</strong>
                  </div>
                  <div className="mt-1 text-sm text-[var(--color-text-primary)]">
                    {useRelativeTime
                      ? t('settings.dateTime.relativePreview')
                      : t('settings.dateTime.absolutePreview')}
                  </div>
                </div>
              </div>

              <div className="ml-4">
                <button
                  id="relative-time-toggle"
                  type="button"
                  role="switch"
                  aria-checked={useRelativeTime}
                  onClick={() => setUseRelativeTime(!useRelativeTime)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    useRelativeTime ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">{t('settings.dateTime.useRelativeTime')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      useRelativeTime ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <label
                htmlFor="access-request-cooldown-display"
                className="block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                {t('settings.dateTime.cooldownFormat')}
              </label>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {t('settings.dateTime.cooldownFormatHelp')}
              </p>
              <select
                id="access-request-cooldown-display"
                value={accessRequestCooldownDisplay}
                onChange={(event) =>
                  setAccessRequestCooldownDisplay(event.target.value as 'days' | 'date' | 'both')
                }
                className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="days">{t('settings.dateTime.cooldownDays')}</option>
                <option value="date">{t('settings.dateTime.cooldownDate')}</option>
                <option value="both">{t('settings.dateTime.cooldownBoth')}</option>
              </select>
            </div>
          </div>
          </Panel>

          <Panel as="section">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.themeSelector.title')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.themeSelector.description')}
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label
                htmlFor="theme-selector-stay-open"
                className={`flex cursor-pointer flex-col rounded-lg border p-4 ${
                  !autoCloseThemeSelector
                    ? 'border-[var(--color-primary)] bg-[var(--color-surface-elevated)] shadow-sm'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-[var(--color-text-primary)]">
                      {t('settings.themeSelector.stayOpen')}
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {t('settings.themeSelector.stayOpenHelp')}
                    </p>
                  </div>
                  <input
                    id="theme-selector-stay-open"
                    type="radio"
                    name="theme-selector-behavior"
                    className="h-4 w-4 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                    checked={!autoCloseThemeSelector}
                    onChange={() => setAutoCloseThemeSelector(false)}
                  />
                </div>
              </label>

              <label
                htmlFor="theme-selector-auto-close"
                className={`flex cursor-pointer flex-col rounded-lg border p-4 ${
                  autoCloseThemeSelector
                    ? 'border-[var(--color-primary)] bg-[var(--color-surface-elevated)] shadow-sm'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-[var(--color-text-primary)]">
                      {t('settings.themeSelector.autoClose')}
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {t('settings.themeSelector.autoCloseHelp')}
                    </p>
                  </div>
                  <input
                    id="theme-selector-auto-close"
                    type="radio"
                    name="theme-selector-behavior"
                    className="h-4 w-4 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                    checked={autoCloseThemeSelector}
                    onChange={() => setAutoCloseThemeSelector(true)}
                  />
                </div>
              </label>
            </div>
          </Panel>

          <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.savedItems.title')}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.savedItems.description')}
          </p>

          <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
            <div className="pr-4">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">
                {t('settings.savedItems.notifyLabel')}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {t('settings.savedItems.notifyHelp')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyRemovedSavedPosts}
              onClick={() => setNotifyRemovedSavedPosts(!notifyRemovedSavedPosts)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                notifyRemovedSavedPosts ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">{t('settings.savedItems.notifyLabel')}</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  notifyRemovedSavedPosts ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          </Panel>

          <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.omniFeed.title')}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.omniFeed.description')}
          </p>

          <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
            <div className="pr-4">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">
                {t('settings.omniFeed.defaultOmniLabel')}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {t('settings.omniFeed.defaultOmniHelp')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={defaultOmniPostsOnly}
              onClick={() => setDefaultOmniPostsOnly(!defaultOmniPostsOnly)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                defaultOmniPostsOnly ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">{t('common.accessibility.toggleOmniFeed')}</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  defaultOmniPostsOnly ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.omniFeed.stayOnPostLabel')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.omniFeed.stayOnPostHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={stayOnPostAfterHide}
                onClick={() => setStayOnPostAfterHide(!stayOnPostAfterHide)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  stayOnPostAfterHide ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('settings.omniFeed.stayOnPostLabel')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    stayOnPostAfterHide ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          </Panel>

          {/* Infinite Scroll Settings */}
          <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.pageNavigation.title')}
          </h2>
          <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
            {t('settings.pageNavigation.description')}
          </p>

          <div className="space-y-6">
            {/* Home Feed Toggle */}
            <div className="flex items-start justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="flex-1">
                <label
                  htmlFor="infinite-scroll-home-toggle"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.pageNavigation.homeFeed')}
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {useInfiniteScrollHome
                    ? t('settings.pageNavigation.infiniteScroll')
                    : t('settings.pageNavigation.pagination')}
                </p>
              </div>

              <div className="ml-4">
                <button
                  id="infinite-scroll-home-toggle"
                  type="button"
                  role="switch"
                  aria-checked={useInfiniteScrollHome}
                  onClick={() => setUseInfiniteScrollHome(!useInfiniteScrollHome)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    useInfiniteScrollHome ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">{t('common.accessibility.toggleInfiniteScroll')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      useInfiniteScrollHome ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Hubs Toggle */}
            <div className="flex items-start justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="flex-1">
                <label
                  htmlFor="infinite-scroll-hubs-toggle"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.pageNavigation.hubPages')}
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {useInfiniteScrollHubs
                    ? t('settings.pageNavigation.infiniteScroll')
                    : t('settings.pageNavigation.pagination')}
                </p>
              </div>

              <div className="ml-4">
                <button
                  id="infinite-scroll-hubs-toggle"
                  type="button"
                  role="switch"
                  aria-checked={useInfiniteScrollHubs}
                  onClick={() => setUseInfiniteScrollHubs(!useInfiniteScrollHubs)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    useInfiniteScrollHubs ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">{t('common.accessibility.toggleInfiniteScroll')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      useInfiniteScrollHubs ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Subreddits Toggle */}
            <div className="flex items-start justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="flex-1">
                <label
                  htmlFor="infinite-scroll-subs-toggle"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.pageNavigation.subredditPages')}
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {useInfiniteScrollSubs
                    ? t('settings.pageNavigation.infiniteScroll')
                    : t('settings.pageNavigation.pagination')}
                </p>
              </div>

              <div className="ml-4">
                <button
                  id="infinite-scroll-subs-toggle"
                  type="button"
                  role="switch"
                  aria-checked={useInfiniteScrollSubs}
                  onClick={() => setUseInfiniteScrollSubs(!useInfiniteScrollSubs)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    useInfiniteScrollSubs ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">{t('common.accessibility.toggleInfiniteScroll')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      useInfiniteScrollSubs ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
          </Panel>
        </div>

        <div hidden={activeTab !== 'privacy'}>
          {/* NSFW Search & Visibility */}
          <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.nsfw.title')}
          </h2>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label
                  htmlFor="block-all-nsfw-toggle"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.nsfw.blockAll')}
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.nsfw.blockAllHelp')}
                </p>
              </div>
              <div className="ml-4">
                <button
                  id="block-all-nsfw-toggle"
                  type="button"
                  role="switch"
                  aria-checked={blockAllNsfw}
                  onClick={() => setBlockAllNsfw(!blockAllNsfw)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    blockAllNsfw ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">{t('settings.nsfw.blockAll')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      blockAllNsfw ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label
                  htmlFor="search-include-nsfw-default-toggle"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.nsfw.defaultInclude')}
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.nsfw.defaultIncludeHelp')}
                </p>
              </div>
              <div className="ml-4">
                <button
                  id="search-include-nsfw-default-toggle"
                  type="button"
                  role="switch"
                  aria-checked={searchIncludeNsfwByDefault && !blockAllNsfw}
                  onClick={() => {
                    if (blockAllNsfw) return;
                    setSearchIncludeNsfwByDefault(!searchIncludeNsfwByDefault);
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    searchIncludeNsfwByDefault && !blockAllNsfw
                      ? 'bg-[var(--color-primary)]'
                      : 'bg-gray-300'
                  } ${blockAllNsfw ? 'opacity-60' : ''}`}
                  aria-disabled={blockAllNsfw}
                >
                  <span className="sr-only">{t('settings.nsfw.defaultInclude')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      searchIncludeNsfwByDefault && !blockAllNsfw
                        ? 'translate-x-5'
                        : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label
                  htmlFor="block-nsfw-thumbnails-toggle"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.nsfw.blockThumbnails')}
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.nsfw.blockThumbnailsHelp')}
                </p>
              </div>
              <div className="ml-4">
                <button
                  id="block-nsfw-thumbnails-toggle"
                  type="button"
                  role="switch"
                  aria-checked={blockNsfwThumbnails}
                  onClick={() => setBlockNsfwThumbnails(!blockNsfwThumbnails)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    blockNsfwThumbnails ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">{t('settings.nsfw.blockThumbnails')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      blockNsfwThumbnails ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
          </Panel>

          {/* Security & Keys */}
          <Panel as="section">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.security.title')}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.security.description')}
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPublicKey((v) => !v)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {showPublicKey ? t('settings.security.hideKey') : t('settings.security.showKey')}
              </button>
              {publicKey && showPublicKey && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(publicKey);
                      setCopyStatus('copied');
                      setTimeout(() => setCopyStatus('idle'), 1500);
                    } catch {
                      setCopyStatus('error');
                      setTimeout(() => setCopyStatus('idle'), 1500);
                    }
                  }}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  {copyStatus === 'copied'
                    ? t('settings.security.copied')
                    : copyStatus === 'error'
                      ? t('settings.security.copyFailed')
                      : t('settings.security.copy')}
                </button>
              )}
            </div>

            {showPublicKey && (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 text-sm text-[var(--color-text-primary)] break-all">
                {publicKey ? (
                  publicKey
                ) : (
                  <span className="text-[var(--color-text-secondary)]">
                    {t('settings.security.noKey')}
                  </span>
                )}
              </div>
            )}
          </div>
          </Panel>

          {/* Email Settings */}
          <Panel as="section">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.email.title')}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.email.description')}
          </p>

          <div className="mt-4">
            {isEditingEmail ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setEmailError(null);
                  setEmailSuccess(false);

                  if (emailInput !== emailConfirmInput) {
                    setEmailError(t('settings.email.emailMismatch'));
                    return;
                  }

                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(emailInput)) {
                    setEmailError(t('settings.email.invalidEmail'));
                    return;
                  }

                  setIsUpdatingEmail(true);
                  try {
                    await usersService.updateEmail(emailInput, emailConfirmInput);
                    setPendingEmail(emailInput);
                    setEmailSuccess(true);
                    setIsEditingEmail(false);
                    setEmailInput('');
                    setEmailConfirmInput('');
                    // Keep success message visible
                  } catch (error) {
                    setEmailError(
                      error instanceof Error ? error.message : t('settings.email.invalidEmail')
                    );
                  } finally {
                    setIsUpdatingEmail(false);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-semibold text-[var(--color-text-primary)]"
                  >
                    {t('settings.email.newEmail')}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    placeholder={t('auth.fields.emailPlaceholder')}
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="emailConfirm"
                    className="block text-sm font-semibold text-[var(--color-text-primary)]"
                  >
                    {t('settings.email.confirmEmail')}
                  </label>
                  <input
                    type="email"
                    id="emailConfirm"
                    value={emailConfirmInput}
                    onChange={(e) => setEmailConfirmInput(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    placeholder={t('auth.fields.emailPlaceholder')}
                    required
                  />
                </div>

                {emailError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{emailError}</div>
                )}

                {emailSuccess && pendingEmail && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                    <div className="flex items-start gap-2">
                      <span className="text-base">✉️</span>
                      <p>{t('settings.email.verificationSent', { email: pendingEmail })}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isUpdatingEmail}
                    className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {isUpdatingEmail
                      ? t('settings.email.updating')
                      : t('settings.email.saveChanges')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingEmail(false);
                      setEmailInput('');
                      setEmailConfirmInput('');
                      setEmailError(null);
                    }}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {t('settings.email.currentEmail')}
                    </p>
                    <p className="mt-1 text-base text-[var(--color-text-secondary)]">
                      {user?.email || t('settings.email.noEmail')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingEmail(true);
                      setEmailInput(user?.email || '');
                      setEmailConfirmInput('');
                      setEmailError(null);
                      setEmailSuccess(false);
                    }}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    {user?.email ? t('settings.email.updateButton') : t('settings.email.addButton')}
                  </button>
                </div>

                {pendingEmail && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-amber-900">
                            {t('settings.email.pendingEmail')}
                          </p>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            ⚠️ {t('settings.email.pendingVerification')}
                          </span>
                        </div>
                        <p className="text-base text-amber-800">{pendingEmail}</p>
                        <p className="mt-2 text-xs text-amber-700">
                          {t('settings.email.verificationSent', { email: pendingEmail })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsResendingVerification(true);
                          try {
                            await usersService.resendVerification();
                            // Show brief success feedback
                            setEmailSuccess(true);
                            setTimeout(() => setEmailSuccess(false), 3000);
                          } catch (error) {
                            setEmailError(
                              error instanceof Error
                                ? error.message
                                : 'Failed to resend verification email'
                            );
                            setTimeout(() => setEmailError(null), 5000);
                          } finally {
                            setIsResendingVerification(false);
                          }
                        }}
                        disabled={isResendingVerification}
                        className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {isResendingVerification
                          ? t('settings.email.resending')
                          : t('settings.email.resendVerification')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          </Panel>
        </div>

        <div hidden={activeTab !== 'audio_video'}>
          <Panel as="section">
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.audioVideo.devicesTitle')}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.audioVideo.devicesDescription')}
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-1">
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <label
                  htmlFor="preferred-microphone"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.audioVideo.microphone')}
                </label>
                <select
                  id="preferred-microphone"
                  value={micDeviceId}
                  onChange={(e) => setMicDeviceId(e.target.value)}
                  className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="">{t('settings.audioVideo.defaultDevice')}</option>
                  {microphones.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `${t('settings.audioVideo.microphone')} ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <label
                  htmlFor="preferred-camera"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.audioVideo.camera')}
                </label>
                <select
                  id="preferred-camera"
                  value={cameraDeviceId}
                  onChange={(e) => setCameraDeviceId(e.target.value)}
                  className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="">{t('settings.audioVideo.defaultDevice')}</option>
                  {cameras.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `${t('settings.audioVideo.camera')} ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                <label
                  htmlFor="preferred-speaker"
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  {t('settings.audioVideo.speaker')}
                </label>
                <select
                  id="preferred-speaker"
                  value={speakerDeviceId}
                  onChange={(e) => setSpeakerDeviceId(e.target.value)}
                  className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  <option value="">{t('settings.audioVideo.defaultDevice')}</option>
                  {speakers.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `${t('settings.audioVideo.speaker')} ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>

          <Panel as="section">
            <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.audioVideo.transcriptionTitle')}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.audioVideo.transcriptionDescription')}
            </p>

            <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  {t('settings.audioVideo.transcriptionToggle')}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.audioVideo.transcriptionHelp')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={transcriptionOptIn}
                onClick={() => setTranscriptionOptIn(!transcriptionOptIn)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  transcriptionOptIn ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('settings.audioVideo.transcriptionToggle')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    transcriptionOptIn ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </Panel>

          {(voiceCallsEnabled || videoCallsEnabled || lazyLoadImagesEnabled) && (
            <>
              <div className="border-b border-[var(--color-border)] pb-2 pt-4">
                <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {t('settings.betaFeatures.title')}
                </h2>
              </div>

              <Panel as="section">
                <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
                  {t('settings.betaFeatures.experimentalTitle')}
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {t('settings.betaFeatures.experimentalDescription')}
                </p>

                <div className="mt-4 space-y-4">
                  {voiceCallsEnabled && (
                    <div className="rounded-md border border-[var(--color-primary)] bg-blue-50 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🎙️</span>
                        <div>
                          <h4 className="font-semibold text-[var(--color-text-primary)]">
                            {t('settings.betaFeatures.voiceCalls')}
                          </h4>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {t('settings.betaFeatures.voiceCallsDescription')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {videoCallsEnabled && (
                    <div className="rounded-md border border-[var(--color-primary)] bg-blue-50 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📹</span>
                        <div>
                          <h4 className="font-semibold text-[var(--color-text-primary)]">
                            {t('settings.betaFeatures.videoCalls')}
                          </h4>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {t('settings.betaFeatures.videoCallsDescription')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {lazyLoadImagesEnabled && (
                    <div className="rounded-md border border-green-600 bg-green-50 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">⚡</span>
                        <div>
                          <h4 className="font-semibold text-[var(--color-text-primary)]">
                            {t('settings.betaFeatures.performanceMode')}
                          </h4>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {t('settings.betaFeatures.performanceModeDescription')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      <Trans
                        i18nKey="settings.betaFeatures.noteWithLabel"
                        components={{ strong: <strong /> }}
                      />
                    </p>
                  </div>
                </div>
              </Panel>
            </>
          )}
        </div>

        <div hidden={activeTab !== 'privacy'}>
          {/* Account & Privacy */}
          <div className="border-b border-[var(--color-border)] pb-2 pt-4">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {t('settings.categories.accountPrivacy')}
            </h2>
          </div>

          {/* Data Export (P0-016: GDPR Right to Data Portability) */}
          <Panel as="section">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('settings.dataExport.title')}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.dataExport.description')}
          </p>

                  <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="export-password">
              Confirm password
            </label>
            <input
              id="export-password"
              type="password"
              autoComplete="current-password"
              value={exportPassword}
              onChange={(event) => setExportPassword(event.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />

            <div className="mt-4">
            <button
              type="button"
              onClick={async () => {
                setIsRequestingExport(true);
                setExportError(null);
                setExportSuccess(null);

                try {
                  const response = await accountService.requestDataExport({
                    password: exportPassword,
                    data_types: [
                      'profile',
                      'messages',
                      'posts',
                      'comments',
                      'votes',
                      'saved',
                      'hubs',
                      'settings',
                      'encryption_keys',
                    ],
                    include_deleted: false,
                  });

                  setExportSuccess(
                    t('settings.dataExport.successMessage', { exportId: response.export_id })
                  );
                } catch (error) {
                  setExportError(
                    error instanceof Error ? error.message : t('settings.dataExport.requestButton')
                  );
                } finally {
                  setExportPassword('');
                  setIsRequestingExport(false);
                }
              }}
              disabled={isRequestingExport || !exportPassword.trim()}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {isRequestingExport
                ? t('settings.dataExport.requesting')
                : t('settings.dataExport.requestButton')}
            </button>

            {exportError && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
                {exportError}
              </div>
            )}

            {exportSuccess && (
              <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-600">
                {exportSuccess}
              </div>
            )}

            <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t('settings.dataExport.included')}
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
                {(t('settings.dataExport.includedList', { returnObjects: true }) as string[]).map(
                  (item: string, index: number) => (
                    <li key={index}>• {item}</li>
                  )
                )}
              </ul>
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                {t('settings.dataExport.availabilityNote')}
              </p>
            </div>
            </div>
          </div>
          </Panel>

          {/* Account Deletion */}
          <Panel as="section">
            <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.accountDeletion.title')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.accountDeletion.description')}
            </p>

            <div className="mt-4">
              <a
                href="/profile?tab=account"
                className="inline-block rounded-md border border-red-600 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
              >
                {t('settings.accountDeletion.manageButton')}
              </a>
            </div>
          </Panel>

          <Panel as="section">
            <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('settings.blockedUsers.title')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('settings.blockedUsers.description')}
            </p>
            <div className="mt-4">
              <Link
                to="/settings/blocked-users"
                className="inline-block rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {t('settings.blockedUsers.manageButton')}
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      {/* Theme Editor Modal */}
      <ThemeEditor isOpen={isThemeEditorOpen} onClose={() => setIsThemeEditorOpen(false)} />
    </div>
  );
}
