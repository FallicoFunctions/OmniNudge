import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
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
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { FEATURE_FLAGS } from '../config/featureFlags';

export default function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    useRelativeTime,
    setUseRelativeTime,
    autoCloseThemeSelector,
    setAutoCloseThemeSelector,
    notifyArchivedMessages,
    setNotifyArchivedMessages,
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
    readReceipts,
    setReadReceipts,
    typingIndicators,
    setTypingIndicators,
    notificationSound,
    setNotificationSound,
  } = useSettings();
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

  // Data Export (P0-016)
  const [isRequestingExport, setIsRequestingExport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Feature Flags (P0-012: Demonstrate feature flag integration)
  const voiceCallsEnabled = useFeatureFlag(FEATURE_FLAGS.VOICE_CALLS);
  const videoCallsEnabled = useFeatureFlag(FEATURE_FLAGS.VIDEO_CALLS);
  const lazyLoadImagesEnabled = useFeatureFlag(FEATURE_FLAGS.LAZY_LOAD_IMAGES);

  // Push Notifications
  const {
    isSupported: pushSupported,
    isRegistered: pushEnabled,
    requestPermission: enablePush,
    unregister: disablePush
  } = usePushNotifications();

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{t('settings.title')}</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="space-y-8">
        {/* SETTINGS-5: Category header for Appearance */}
        <div className="border-b border-[var(--color-border)] pb-2">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('settings.categories.appearance')}</h2>
        </div>

        {/* Theme Selection */}
        <Panel as="section">
          <h3 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.themeSection.title')}</h3>
          <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
            {t('settings.themeSection.description')}
          </p>
          <ThemeSelector onCreateNewTheme={() => setIsThemeEditorOpen(true)} />
        </Panel>

        {/* Language Selection */}
        <Panel as="section">
          <LanguageSelector />
        </Panel>

        {/* SETTINGS-5: Category header for Notifications */}
        <div className="border-b border-[var(--color-border)] pb-2 pt-4">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('settings.categories.notifications')}</h2>
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
              <span className="sr-only">{t('common.accessibility.toggleArchivedNotifications')}</span>
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
                  {pushEnabled
                    ? t('settings.pushNotificationsSection.toggleHelpOn')
                    : t('settings.pushNotificationsSection.toggleHelpOff')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                onClick={() => pushEnabled ? disablePush() : enablePush()}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                  pushEnabled ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                }`}
              >
                <span className="sr-only">{t('common.accessibility.togglePushNotifications')}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
        </Panel>

        {/* Messaging Settings */}
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
          </div>
        </Panel>

        {/* SETTINGS-5: Category header for Preferences */}
        <div className="border-b border-[var(--color-border)] pb-2 pt-4">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('settings.categories.preferences')}</h2>
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
                    {useRelativeTime ? t('settings.dateTime.relativePreview') : t('settings.dateTime.absolutePreview')}
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
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.savedItems.title')}</h2>
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
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.omniFeed.title')}</h2>
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
                  {useInfiniteScrollHome ? t('settings.pageNavigation.infiniteScroll') : t('settings.pageNavigation.pagination')}
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
                  {useInfiniteScrollHubs ? t('settings.pageNavigation.infiniteScroll') : t('settings.pageNavigation.pagination')}
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
                  {useInfiniteScrollSubs ? t('settings.pageNavigation.infiniteScroll') : t('settings.pageNavigation.pagination')}
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

        {/* NSFW Search & Visibility */}
        <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.nsfw.title')}</h2>
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
                    searchIncludeNsfwByDefault && !blockAllNsfw ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  } ${blockAllNsfw ? 'opacity-60' : ''}`}
                  aria-disabled={blockAllNsfw}
                >
                  <span className="sr-only">{t('settings.nsfw.defaultInclude')}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      searchIncludeNsfwByDefault && !blockAllNsfw ? 'translate-x-5' : 'translate-x-0'
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
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.security.title')}</h2>
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
                  {copyStatus === 'copied' ? t('settings.security.copied') : copyStatus === 'error' ? t('settings.security.copyFailed') : t('settings.security.copy')}
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
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.email.title')}</h2>
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
                    setEmailError(error instanceof Error ? error.message : t('settings.email.invalidEmail'));
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
                    placeholder="you@example.com"
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
                    placeholder="you@example.com"
                    required
                  />
                </div>

                {emailError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                    {emailError}
                  </div>
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
                    {isUpdatingEmail ? t('settings.email.updating') : t('settings.email.saveChanges')}
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
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{t('settings.email.currentEmail')}</p>
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
                          <p className="text-sm font-semibold text-amber-900">{t('settings.email.pendingEmail')}</p>
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
                            setEmailError(error instanceof Error ? error.message : 'Failed to resend verification email');
                            setTimeout(() => setEmailError(null), 5000);
                          } finally {
                            setIsResendingVerification(false);
                          }
                        }}
                        disabled={isResendingVerification}
                        className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {isResendingVerification ? t('settings.email.resending') : t('settings.email.resendVerification')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        {/* Beta Features (P0-012: Feature Flag Integration Demo) */}
        {(voiceCallsEnabled.enabled || videoCallsEnabled.enabled || lazyLoadImagesEnabled.enabled) && (
          <>
            <div className="border-b border-[var(--color-border)] pb-2 pt-4">
              <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('settings.betaFeatures.title')}</h2>
            </div>

            <Panel as="section">
              <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.betaFeatures.experimentalTitle')}</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('settings.betaFeatures.experimentalDescription')}
              </p>

              <div className="mt-4 space-y-4">
                {voiceCallsEnabled.enabled && (
                  <div className="rounded-md border border-[var(--color-primary)] bg-blue-50 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎙️</span>
                      <div>
                        <h4 className="font-semibold text-[var(--color-text-primary)]">{t('settings.betaFeatures.voiceCalls')}</h4>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                          {t('settings.betaFeatures.voiceCallsDescription')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {videoCallsEnabled.enabled && (
                  <div className="rounded-md border border-[var(--color-primary)] bg-blue-50 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📹</span>
                      <div>
                        <h4 className="font-semibold text-[var(--color-text-primary)]">{t('settings.betaFeatures.videoCalls')}</h4>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                          {t('settings.betaFeatures.videoCallsDescription')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {lazyLoadImagesEnabled.enabled && (
                  <div className="rounded-md border border-green-600 bg-green-50 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⚡</span>
                      <div>
                        <h4 className="font-semibold text-[var(--color-text-primary)]">{t('settings.betaFeatures.performanceMode')}</h4>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                          {t('settings.betaFeatures.performanceModeDescription')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    <strong>Note:</strong> {t('settings.betaFeatures.note')}
                  </p>
                </div>
              </div>
            </Panel>
          </>
        )}

        {/* Account & Privacy */}
        <div className="border-b border-[var(--color-border)] pb-2 pt-4">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('settings.categories.accountPrivacy')}</h2>
        </div>

        {/* Data Export (P0-016: GDPR Right to Data Portability) */}
        <Panel as="section">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.dataExport.title')}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.dataExport.description')}
          </p>

          <div className="mt-4">
            <button
              type="button"
              onClick={async () => {
                setIsRequestingExport(true);
                setExportError(null);
                setExportSuccess(null);

                try {
                  const response = await accountService.requestDataExport({
                    data_types: ['profile', 'messages', 'posts', 'comments', 'votes', 'saved', 'hubs', 'settings', 'encryption_keys'],
                    include_deleted: false
                  });

                  setExportSuccess(t('settings.dataExport.successMessage', { exportId: response.export_id }));
                } catch (error) {
                  setExportError(error instanceof Error ? error.message : t('settings.dataExport.requestButton'));
                } finally {
                  setIsRequestingExport(false);
                }
              }}
              disabled={isRequestingExport}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {isRequestingExport ? t('settings.dataExport.requesting') : t('settings.dataExport.requestButton')}
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
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{t('settings.dataExport.included')}</h4>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
                {(t('settings.dataExport.includedList', { returnObjects: true }) as string[]).map((item: string, index: number) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                {t('settings.dataExport.availabilityNote')}
              </p>
            </div>
          </div>
        </Panel>

        {/* Account Deletion */}
        <Panel as="section">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">{t('settings.accountDeletion.title')}</h2>
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
      </div>

      {/* Theme Editor Modal */}
      <ThemeEditor
        isOpen={isThemeEditorOpen}
        onClose={() => setIsThemeEditorOpen(false)}
      />
    </div>
  );
}
