import { useSettings } from '../contexts/SettingsContext';

export default function SettingsPage() {
  const { useRelativeTime, setUseRelativeTime } = useSettings();

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

        {/* Future settings sections can go here */}
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            More Settings Coming Soon
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Additional customization options will be added in future updates.
          </p>
        </section>
      </div>
    </div>
  );
}
