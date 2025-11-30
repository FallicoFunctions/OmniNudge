import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PageName } from '../../types/theme';
import { DEFAULT_THEME_VARIABLES } from '../../data/themeVariables';

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

  const mergedVariables = useMemo(
    () => ({ ...DEFAULT_THEME_VARIABLES, ...variables }),
    [variables]
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

  const frameContent = (
    <div
      className={`rounded-3xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg transition-all ${
        deviceMode === 'mobile' ? 'mx-auto scale-95' : 'scale-100'
      }`}
      style={previewStyle}
    >
      <header className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            OmniNudge
          </p>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            {selectedPage.charAt(0).toUpperCase() + selectedPage.slice(1)}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="h-8 w-8 rounded-full bg-[var(--color-primary)]/20" />
          <span className="h-8 w-8 rounded-full bg-[var(--color-success)]/20" />
        </div>
      </header>

      {selectedPage === 'feed' && (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <article
              key={item}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Creator {item}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">2h ago · Boosted</p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white"
                >
                  Follow
                </button>
              </div>
              <p className="mt-3 text-sm text-[var(--color-text-primary)]">
                "Building theme systems is fun! This preview updates live as you tweak variables."
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full bg-[var(--color-surface-elevated)] px-3 py-1 text-xs text-[var(--color-text-secondary)]">
                  #design
                </span>
                <span className="rounded-full bg-[var(--color-surface-elevated)] px-3 py-1 text-xs text-[var(--color-text-secondary)]">
                  #themes
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedPage === 'profile' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center gap-3">
              <span className="h-14 w-14 rounded-full bg-[var(--color-primary)]/20" />
              <div>
                <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                  Explorer
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Community Builder · 12k followers
                </p>
              </div>
              <button
                type="button"
                className="ml-auto rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)]"
              >
                Message
              </button>
            </div>
            <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
              Working on OmniNudge theme marketplace. I love vibrant palettes and soft gradients.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {['Posts', 'Themes', 'Reactions'].map((label) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center"
              >
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {label}
                </p>
                <p className="text-lg font-bold text-[var(--color-text-primary)]">128</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPage === 'messages' && (
        <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
          <div className="space-y-2">
            {['Design Squad', 'Product Crew', 'Ops Updates'].map((room, index) => (
              <div
                key={room}
                className={`rounded-xl border px-3 py-2 ${
                  index === 0
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{room}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">2 unread messages</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3">
              <span className="h-10 w-10 rounded-full bg-[var(--color-primary)]/20" />
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Design Squad
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">Online now</p>
              </div>
            </div>
            <div className="space-y-3 py-4">
              <p className="w-3/4 rounded-2xl rounded-bl-none border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]">
                Can we brighten the accent color a bit more?
              </p>
              <p className="ml-auto w-3/4 rounded-2xl rounded-br-none bg-[var(--color-primary)] px-3 py-2 text-sm text-white">
                Absolutely! Adjusting theme variables live now.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-2">
              <span className="h-3 w-3 rounded-full bg-[var(--color-primary)]" />
              <p className="text-xs text-[var(--color-text-secondary)]">Type your message...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const previewWrapper = (
    <div className="space-y-4">
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
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
          <div className="flex items-center gap-2">
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
