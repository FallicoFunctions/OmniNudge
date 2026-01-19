import { useEffect, useState } from 'react';
import ThemeSelector from '../components/themes/ThemeSelector';
import { Panel } from '../components/common/Panel';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { getOwnPublicKeyBase64 } from '../services/keyManagementService';
import { usersService } from '../services/usersService';

export default function SettingsPage() {
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
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  useEffect(() => {
    setPublicKey(getOwnPublicKeyBase64());
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Customize your OmniNudge experience
        </p>
      </div>

      <div className="space-y-6">
        {/* Theme Selection */}
        <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">Theme</h2>
          <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
            Choose an active theme or create your own.
          </p>
          <ThemeSelector />
        </Panel>

        {/* Messaging Notifications */}
        <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            Archived Chat Notifications
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Control whether you get notifications when new messages arrive in conversations you’ve archived.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
            <div className="pr-4">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">
                Notify for archived conversations
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                When off, archived chats stay quiet; you’ll still see messages when you open them.
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
              <span className="sr-only">Toggle archived chat notifications</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  notifyArchivedMessages ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </Panel>

        {/* Date & Time Settings */}
        <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            Date & Time Display
          </h2>

          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label
                  htmlFor="relative-time-toggle"
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Use Relative Time
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Display timestamps as relative time (e.g., "4 hours ago") instead of absolute
                  dates (e.g., "12/2/2025")
                </p>
                <div className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    <strong>Preview:</strong>
                  </div>
                  <div className="mt-1 text-sm text-[var(--color-text-primary)]">
                    {useRelativeTime ? (
                      <>
                        <span className="font-medium">Relative:</span> submitted 4 hours ago
                      </>
                    ) : (
                      <>
                        <span className="font-medium">Absolute:</span> submitted on 12/2/2025
                      </>
                    )}
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
                  <span className="sr-only">Use relative time</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      useRelativeTime ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel as="section">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            Theme Selector Behavior
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Choose whether the theme dropdown should stay open after you pick a theme or close
            automatically.
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
                    Stay Open (Default)
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Keep browsing other themes without reopening the dropdown.
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
                    Auto-Close After Selection
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Close the dropdown as soon as you activate a theme.
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
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">Saved Items Alerts</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            When Reddit moderators remove a post you’ve saved, OmniNudge automatically cleans it from your Saved tab.
            You can choose whether to see a reminder the next time you open Saved Items.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
            <div className="pr-4">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">
                Notify me about removed Reddit posts
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                When enabled, you’ll see a one-time banner letting you know how many removed posts were cleaned up.
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
              <span className="sr-only">Toggle saved item alerts</span>
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
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">Omni Feed Defaults</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Decide whether your Omni feed should automatically start in “Omni posts only” mode every time
            you sign in. You can still toggle it on the fly from the feed toolbar.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
            <div className="pr-4">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">
                Default to Omni posts only
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                When enabled, the Omni feed filter starts in Omni-only mode on login instead of blending
                Reddit items.
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
              <span className="sr-only">Toggle Omni feed default</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  defaultOmniPostsOnly ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              When you hide an Omni post while viewing it, you can either jump back to where you came from
              or stay on the post. Pick the default behavior below.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="pr-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  Stay on post after hiding
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  When enabled, hiding a post keeps you on the detail view. When disabled, you’ll be sent
                  back to the feed or hub you came from.
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
                <span className="sr-only">Toggle stay-on-post behavior</span>
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
            Page Navigation
          </h2>
          <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
            Control how you browse content on different pages. Choose between infinite scroll (automatically load more as you scroll) or pagination (use Previous/Next buttons).
          </p>

          <div className="space-y-6">
            {/* Home Feed Toggle */}
            <div className="flex items-start justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
              <div className="flex-1">
                <label
                  htmlFor="infinite-scroll-home-toggle"
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Home Feed
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {useInfiniteScrollHome ? (
                    <><span className="font-medium">Infinite Scroll:</span> Posts load automatically as you scroll</>
                  ) : (
                    <><span className="font-medium">Pagination:</span> Use Previous/Next buttons</>
                  )}
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
                  <span className="sr-only">Toggle home feed infinite scroll</span>
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
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Hub Pages
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {useInfiniteScrollHubs ? (
                    <><span className="font-medium">Infinite Scroll:</span> Posts load automatically as you scroll</>
                  ) : (
                    <><span className="font-medium">Pagination:</span> Use Previous/Next buttons</>
                  )}
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
                  <span className="sr-only">Toggle hub pages infinite scroll</span>
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
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Subreddit Pages
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {useInfiniteScrollSubs ? (
                    <><span className="font-medium">Infinite Scroll:</span> Posts load automatically as you scroll</>
                  ) : (
                    <><span className="font-medium">Pagination:</span> Use Previous/Next buttons</>
                  )}
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
                  <span className="sr-only">Toggle subreddit pages infinite scroll</span>
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
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">NSFW Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label
                  htmlFor="block-all-nsfw-toggle"
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Block All NSFW Content
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Hide NSFW posts, hubs, subreddits, and users from search and feeds. Manually navigating to an NSFW page will show a warning instead of content.
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
                  <span className="sr-only">Block all NSFW content</span>
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
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Default “Include NSFW” in Search
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  When enabled, the search dropdown will pre-check “Include NSFW results” (unless NSFW is fully blocked above).
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
                  <span className="sr-only">Default include NSFW in search</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      searchIncludeNsfwByDefault && !blockAllNsfw ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* Security & Keys */}
        <Panel as="section">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">Security</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Your public key is used for end-to-end encrypted features. It isn&apos;t shown on your public profile.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPublicKey((v) => !v)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {showPublicKey ? 'Hide public key' : 'Show public key'}
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
                  {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy'}
                </button>
              )}
            </div>

            {showPublicKey && (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 text-sm text-[var(--color-text-primary)] break-all">
                {publicKey ? (
                  publicKey
                ) : (
                  <span className="text-[var(--color-text-secondary)]">
                    No public key found for this account.
                  </span>
                )}
              </div>
            )}
          </div>
        </Panel>

        {/* Email Settings */}
        <Panel as="section">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">Email</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Manage your email address associated with this account.
          </p>

          <div className="mt-4">
            {isEditingEmail ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setEmailError(null);
                  setEmailSuccess(false);

                  if (emailInput !== emailConfirmInput) {
                    setEmailError('Email addresses do not match');
                    return;
                  }

                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(emailInput)) {
                    setEmailError('Please enter a valid email address');
                    return;
                  }

                  setIsUpdatingEmail(true);
                  try {
                    await usersService.updateEmail(emailInput, emailConfirmInput);
                    await refreshUser();
                    setEmailSuccess(true);
                    setIsEditingEmail(false);
                    setEmailInput('');
                    setEmailConfirmInput('');
                    setTimeout(() => setEmailSuccess(false), 3000);
                  } catch (error) {
                    setEmailError(error instanceof Error ? error.message : 'Failed to update email');
                  } finally {
                    setIsUpdatingEmail(false);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[var(--color-text-primary)]"
                  >
                    New Email Address
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
                    className="block text-sm font-medium text-[var(--color-text-primary)]"
                  >
                    Confirm New Email Address
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

                {emailSuccess && (
                  <div className="rounded-md bg-green-50 p-3 text-sm text-green-600">
                    Email updated successfully
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isUpdatingEmail}
                    className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {isUpdatingEmail ? 'Updating...' : 'Save Changes'}
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
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">Current Email</p>
                    <p className="mt-1 text-base text-[var(--color-text-secondary)]">
                      {user?.email || 'No email set'}
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
                    {user?.email ? 'Update Email' : 'Add Email'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
