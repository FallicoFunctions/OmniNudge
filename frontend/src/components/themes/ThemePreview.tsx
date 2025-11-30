import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PageName } from '../../types/theme';
import { DEFAULT_THEME_VARIABLES } from '../../data/themeVariables';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

type DeviceMode = 'desktop' | 'mobile';

interface ThemePreviewProps {
  variables?: Record<string, string>;
  initialPage?: PageName;
  initialDevice?: DeviceMode;
  showControls?: boolean;
}

const PAGE_OPTIONS: { id: PageName; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'profile', label: 'Profile' },
  { id: 'messages', label: 'Messages' },
];

const DEVICE_OPTIONS: { id: DeviceMode; label: string }[] = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'mobile', label: 'Mobile' },
];

const ThemePreview = ({
  variables = {},
  initialPage = 'feed',
  initialDevice = 'desktop',
  showControls = true,
}: ThemePreviewProps) => {
  const [selectedPage, setSelectedPage] = useState<PageName>(initialPage);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>(initialDevice);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const debouncedVariables = useDebouncedValue(variables, 250);

  const mergedVariables = useMemo(
    () => ({ ...DEFAULT_THEME_VARIABLES, ...debouncedVariables }),
    [debouncedVariables]
  );

  const previewStyle = useMemo(() => {
    const style: CSSProperties = {};
    Object.entries(mergedVariables).forEach(([key, value]) => {
      (style as Record<string, string>)[key] = value;
    });
    return style;
  }, [mergedVariables]);

  const frameClasses =
    deviceMode === 'mobile'
      ? 'w-[320px]'
      : 'w-full max-w-3xl';

  const renderButtonSamples = () => (
    <div
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius-xl)' }}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
        Buttons
      </p>
      <div
        className="mt-3 grid gap-2 md:grid-cols-2"
        style={{ gap: 'var(--spacing-sm)' }}
      >
        <button
          type="button"
          className="rounded-lg bg-[var(--color-primary)] font-semibold text-white"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          Primary Action
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--color-primary)] font-semibold text-[var(--color-primary)]"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          Secondary
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] font-semibold text-[var(--color-text-primary)]"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          Outline
        </button>
        <button
          type="button"
          className="rounded-lg bg-[var(--color-error)]/10 font-semibold text-[var(--color-error)]"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          Danger
        </button>
      </div>
    </div>
  );

  const renderFormSamples = () => (
    <div
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius-xl)' }}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
        Form Elements
      </p>
      <div className="mt-3 flex flex-col" style={{ gap: 'var(--spacing-sm)' }}>
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Project Name
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            style={{ padding: 'var(--spacing-xs) var(--spacing-sm)' }}
            defaultValue="OmniNudge Preview"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Category
          <select
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            style={{ padding: 'var(--spacing-xs) var(--spacing-sm)' }}
            defaultValue="design"
          >
            <option value="design">Design</option>
            <option value="marketing">Marketing</option>
            <option value="dev">Development</option>
          </select>
        </label>
        <label className="flex items-center justify-between text-sm text-[var(--color-text-primary)]">
          Enable Beta Access
          <span className="relative inline-flex items-center">
            <input type="checkbox" defaultChecked className="peer sr-only" />
            <span className="h-5 w-10 rounded-full bg-[var(--color-border)] transition-all peer-checked:bg-[var(--color-primary)]" />
            <span className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-all peer-checked:translate-x-5" />
          </span>
        </label>
      </div>
    </div>
  );

  const renderStatusBadges = () => (
    <div
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius-xl)' }}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
        Status Indicators
      </p>
      <div
        className="mt-3 grid gap-3 sm:grid-cols-2"
        style={{ gap: 'var(--spacing-sm)' }}
      >
        {[
          { label: 'Live', color: 'var(--color-success)' },
          { label: 'Scheduled', color: 'var(--color-info)' },
          { label: 'Needs Review', color: 'var(--color-warning)' },
          { label: 'Blocked', color: 'var(--color-error)' },
        ].map((status) => (
          <div
            key={status.label}
            className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
            style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
          >
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {status.label}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">8 updates</p>
            </div>
            <span
              className="h-8 w-8 rounded-full"
              style={{ backgroundColor: status.color, opacity: 0.2 }}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderCommonSections = () => (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2" role="region" aria-label="Common component samples">
        {renderButtonSamples()}
        {renderFormSamples()}
      </div>
      {renderStatusBadges()}
    </div>
  );

  const frameContent = (
    <div
      className={`rounded-3xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg transition-all ${
        deviceMode === 'mobile' ? 'mx-auto scale-95' : 'scale-100'
      }`}
      style={{
        ...previewStyle,
        fontFamily: 'var(--font-family-base)',
        padding: 'var(--spacing-xl)',
        borderRadius: 'var(--border-radius-2xl)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <header
        className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--border-radius-xl)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]" aria-label="Theme preview section heading">
            OmniNudge
          </p>
          <p
            className="font-semibold text-[var(--color-text-primary)]"
            style={{ fontSize: 'var(--font-size-lg)' }}
          >
            {selectedPage.charAt(0).toUpperCase() + selectedPage.slice(1)}
          </p>
        </div>
        <div className="flex gap-2" style={{ gap: 'var(--spacing-sm)' }} aria-label="Avatar indicators">
          <span
            className="h-8 w-8 rounded-full bg-[var(--color-primary)]/20"
            style={{ borderRadius: 'var(--border-radius-lg)' }}
          />
          <span
            className="h-8 w-8 rounded-full bg-[var(--color-success)]/20"
            style={{ borderRadius: 'var(--border-radius-lg)' }}
          />
        </div>
      </header>

      {selectedPage === 'feed' && (
        <div className="flex flex-col" style={{ gap: 'var(--spacing-md)' }}>
          {[1, 2, 3].map((item) => (
            <article
              key={item}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--border-radius-xl)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="font-semibold text-[var(--color-text-primary)]"
                    style={{ fontSize: 'var(--font-size-base)' }}
                  >
                    Creator {item}
                  </p>
                  <p
                    className="text-[var(--color-text-secondary)]"
                    style={{ fontSize: 'var(--font-size-sm)' }}
                  >
                    2h ago · Boosted
                  </p>
                </div>
            <button
              type="button"
              className="rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white"
              style={{
                padding: 'var(--spacing-xs) var(--spacing-sm)',
                borderRadius: 'var(--border-radius-2xl)',
              }}
              aria-label={`Follow Creator ${item}`}
            >
              Follow
            </button>
              </div>
              <p
                className="text-[var(--color-text-primary)]"
                style={{ marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}
              >
                "Building theme systems is fun! This preview updates live as you tweak variables."
              </p>
              <div
                className="flex"
                style={{ marginTop: 'var(--spacing-sm)', gap: 'var(--spacing-sm)' }}
              >
                <span
                  className="rounded-full bg-[var(--color-surface-elevated)] text-xs text-[var(--color-text-secondary)]"
                  style={{
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    borderRadius: 'var(--border-radius-2xl)',
                  }}
                >
                  #design
                </span>
                <span
                  className="rounded-full bg-[var(--color-surface-elevated)] text-xs text-[var(--color-text-secondary)]"
                  style={{
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    borderRadius: 'var(--border-radius-2xl)',
                  }}
                >
                  #themes
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedPage === 'profile' && (
        <div className="flex flex-col" style={{ gap: 'var(--spacing-lg)' }}>
          <div
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            style={{
              padding: 'var(--spacing-lg)',
              borderRadius: 'var(--border-radius-2xl)',
              boxShadow: 'var(--shadow-md)',
            }}
            aria-label="Profile summary"
          >
            <div className="flex items-center" style={{ gap: 'var(--spacing-sm)' }}>
              <span
                className="h-14 w-14 bg-[var(--color-primary)]/20"
                style={{ borderRadius: 'var(--border-radius-2xl)' }}
              />
              <div>
                <p
                  className="font-semibold text-[var(--color-text-primary)]"
                  style={{ fontSize: 'var(--font-size-xl)' }}
                >
                  Explorer
                </p>
                <p
                  className="text-[var(--color-text-secondary)]"
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  Community Builder · 12k followers
                </p>
              </div>
              <button
                type="button"
                className="ml-auto rounded-full border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)]"
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-md)',
                  borderRadius: 'var(--border-radius-2xl)',
                }}
              >
                Message
              </button>
            </div>
            <p
              className="text-[var(--color-text-secondary)]"
              style={{ marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}
            >
              Working on OmniNudge theme marketplace. I love vibrant palettes and soft gradients.
            </p>
          </div>
          <div className="grid md:grid-cols-3" style={{ gap: 'var(--spacing-md)' }}>
            {['Posts', 'Themes', 'Reactions'].map((label) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center"
                style={{
                  padding: 'var(--spacing-md)',
                  borderRadius: 'var(--border-radius-xl)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {label}
                </p>
                <p
                  className="font-bold text-[var(--color-text-primary)]"
                  style={{ fontSize: 'var(--font-size-lg)' }}
                >
                  128
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPage === 'messages' && (
        <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]" style={{ gap: 'var(--spacing-md)' }}>
          <div className="flex flex-col" style={{ gap: 'var(--spacing-sm)' }}>
            {['Design Squad', 'Product Crew', 'Ops Updates'].map((room, index) => (
              <div
                key={room}
                className={`rounded-xl border ${
                  index === 0
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
                style={{
                  padding: 'var(--spacing-sm)',
                  borderRadius: 'var(--border-radius-lg)',
                }}
              >
                <p
                  className="font-semibold text-[var(--color-text-primary)]"
                  style={{ fontSize: 'var(--font-size-base)' }}
                >
                  {room}
                </p>
                <p
                  className="text-[var(--color-text-secondary)]"
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  2 unread messages
                </p>
              </div>
            ))}
          </div>
          <div
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            style={{
              padding: 'var(--spacing-lg)',
              borderRadius: 'var(--border-radius-2xl)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div
              className="flex items-center border-b border-[var(--color-border)] pb-3"
              style={{ gap: 'var(--spacing-sm)', paddingBottom: 'var(--spacing-sm)' }}
            >
              <span
                className="h-10 w-10 rounded-full bg-[var(--color-primary)]/20"
                style={{ borderRadius: 'var(--border-radius-2xl)' }}
              />
              <div>
                <p
                  className="font-semibold text-[var(--color-text-primary)]"
                  style={{ fontSize: 'var(--font-size-base)' }}
                >
                  Design Squad
                </p>
                <p
                  className="text-[var(--color-text-secondary)]"
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  Online now
                </p>
              </div>
            </div>
            <div
              className="flex flex-col py-4"
              style={{ gap: 'var(--spacing-sm)', paddingTop: 'var(--spacing-md)', paddingBottom: 'var(--spacing-md)' }}
            >
              <p
                className="w-3/4 rounded-2xl rounded-bl-none border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)]"
                style={{
                  padding: 'var(--spacing-sm)',
                  fontSize: 'var(--font-size-base)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                Can we brighten the accent color a bit more?
              </p>
              <p
                className="ml-auto w-3/4 rounded-2xl rounded-br-none bg-[var(--color-primary)] text-white"
                style={{
                  padding: 'var(--spacing-sm)',
                  fontSize: 'var(--font-size-base)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                Absolutely! Adjusting theme variables live now.
              </p>
            </div>
            <div
              className="flex items-center rounded-full border border-[var(--color-border)]"
              style={{
                padding: 'var(--spacing-xs) var(--spacing-md)',
                gap: 'var(--spacing-xs)',
              }}
            >
              <span className="h-3 w-3 rounded-full bg-[var(--color-primary)]" />
              <p
                className="text-[var(--color-text-secondary)]"
                style={{ fontSize: 'var(--font-size-sm)' }}
              >
                Type your message...
              </p>
            </div>
          </div>
        </div>
      )}
      {renderCommonSections()}
    </div>
  );

  const previewWrapper = (
    <div className="space-y-4">
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" style={{ gap: 'var(--spacing-sm)' }}>
            {PAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`rounded-full px-4 py-1 text-sm font-semibold ${
                  selectedPage === option.id
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
                }`}
                onClick={() => setSelectedPage(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2" style={{ gap: 'var(--spacing-sm)' }}>
            {DEVICE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`rounded-full px-4 py-1 text-xs font-semibold ${
                  deviceMode === option.id
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
                }`}
                onClick={() => setDeviceMode(option.id)}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)]"
              onClick={() => setIsFullscreen((prev) => !prev)}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          </div>
        </div>
      )}

      <div className={`relative ${isFullscreen ? 'z-50' : ''}`}>
        <div className={`${frameClasses} transition-all`}>
          {frameContent}
        </div>
      </div>
    </div>
  );

  if (!isFullscreen) {
    return previewWrapper;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-5xl">
        {previewWrapper}
      </div>
    </div>
  );
};

export default ThemePreview;
