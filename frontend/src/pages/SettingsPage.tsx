import { useSettings } from '../contexts/SettingsContext';

export default function SettingsPage() {
  const {
    useRelativeTime,
    setUseRelativeTime,
    autoCloseThemeSelector,
    setAutoCloseThemeSelector,
    notifyRemovedSavedPosts,
    setNotifyRemovedSavedPosts,
    defaultOmniPostsOnly,
    setDefaultOmniPostsOnly,
    stayOnPostAfterHide,
    setStayOnPostAfterHide,
    useInfiniteScroll,
    setUseInfiniteScroll,
  } = useSettings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Customize your OmniNudge experience
        </p>
      </div>

      <div className="space-y-6">
        {/* Date & Time Settings */}
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
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
        </section>

        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
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
        </section>

        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
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
        </section>

        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
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
        </section>

        {/* Infinite Scroll Settings */}
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            Subreddit Page Navigation
          </h2>

          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label
                  htmlFor="infinite-scroll-toggle"
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Use Infinite Scroll
                </label>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Automatically load more posts as you scroll down on subreddit pages. When disabled, use traditional page-by-page navigation with Previous/Next buttons.
                </p>
                <div className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    <strong>Current mode:</strong>
                  </div>
                  <div className="mt-1 text-sm text-[var(--color-text-primary)]">
                    {useInfiniteScroll ? (
                      <>
                        <span className="font-medium">Infinite Scroll:</span> New posts load automatically as you scroll
                      </>
                    ) : (
                      <>
                        <span className="font-medium">Pagination:</span> Use Previous/Next buttons to navigate
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="ml-4">
                <button
                  id="infinite-scroll-toggle"
                  type="button"
                  role="switch"
                  aria-checked={useInfiniteScroll}
                  onClick={() => setUseInfiniteScroll(!useInfiniteScroll)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                    useInfiniteScroll ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">Use infinite scroll</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      useInfiniteScroll ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
