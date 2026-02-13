import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageName } from '../../types/theme';
import { DEFAULT_THEME_VARIABLES } from '../../data/themeVariables';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFormat } from '../../hooks/useFormat';

type DeviceMode = 'desktop' | 'mobile';

interface ThemePreviewProps {
  variables?: Record<string, string>;
  initialPage?: PageName;
  initialDevice?: DeviceMode;
  showControls?: boolean;
}

const PAGE_OPTIONS: { id: PageName; labelKey: string }[] = [
  { id: 'feed', labelKey: 'themes.preview.pages.feed' },
  { id: 'profile', labelKey: 'themes.preview.pages.profile' },
  { id: 'messages', labelKey: 'themes.preview.pages.messages' },
];

const DEVICE_OPTIONS: { id: DeviceMode; labelKey: string }[] = [
  { id: 'desktop', labelKey: 'themes.preview.devices.desktop' },
  { id: 'mobile', labelKey: 'themes.preview.devices.mobile' },
];

const ThemePreview = ({
  variables = {},
  initialPage = 'feed',
  initialDevice = 'desktop',
  showControls = true,
}: ThemePreviewProps) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
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

  const frameClasses = deviceMode === 'mobile' ? 'w-[320px]' : 'w-full max-w-3xl';

  const renderButtonSamples = () => (
    <div
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--border-radius-xl)' }}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
        {t('themes.preview.sections.buttons')}
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2" style={{ gap: 'var(--spacing-sm)' }}>
        <button
          type="button"
          className="rounded-lg bg-[var(--color-primary)] font-semibold text-white"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          {t('themes.preview.buttons.primary')}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--color-primary)] font-semibold text-[var(--color-primary)]"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          {t('themes.preview.buttons.secondary')}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] font-semibold text-[var(--color-text-primary)]"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          {t('themes.preview.buttons.outline')}
        </button>
        <button
          type="button"
          className="rounded-lg bg-[var(--color-error)]/10 font-semibold text-[var(--color-error)]"
          style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
        >
          {t('themes.preview.buttons.danger')}
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
        {t('themes.preview.sections.formElements')}
      </p>
      <div className="mt-3 flex flex-col" style={{ gap: 'var(--spacing-sm)' }}>
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('themes.preview.form.projectName')}
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            style={{ padding: 'var(--spacing-xs) var(--spacing-sm)' }}
            defaultValue={t('themes.preview.form.projectNameDefault')}
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('themes.preview.form.category')}
          <select
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            style={{ padding: 'var(--spacing-xs) var(--spacing-sm)' }}
            defaultValue="design"
          >
            <option value="design">{t('themes.preview.form.categoryOptions.design')}</option>
            <option value="marketing">{t('themes.preview.form.categoryOptions.marketing')}</option>
            <option value="dev">{t('themes.preview.form.categoryOptions.dev')}</option>
          </select>
        </label>
        <label className="flex items-center justify-between text-sm text-[var(--color-text-primary)]">
          {t('themes.preview.form.enableBetaAccess')}
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
        {t('themes.preview.sections.statusIndicators')}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2" style={{ gap: 'var(--spacing-sm)' }}>
        {[
          { id: 'live', label: t('themes.preview.status.live'), color: 'var(--color-success)' },
          {
            id: 'scheduled',
            label: t('themes.preview.status.scheduled'),
            color: 'var(--color-info)',
          },
          {
            id: 'needsReview',
            label: t('themes.preview.status.needsReview'),
            color: 'var(--color-warning)',
          },
          { id: 'blocked', label: t('themes.preview.status.blocked'), color: 'var(--color-error)' },
        ].map((status) => (
          <div
            key={status.id}
            className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
            style={{ padding: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-lg)' }}
          >
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {status.label}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {t('themes.preview.status.updates', {
                  count: 8,
                  formattedCount: formatNumber(8),
                })}
              </p>
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
      <div
        className="grid gap-4 lg:grid-cols-2"
        role="region"
        aria-label={t('themes.preview.aria.commonSamples')}
      >
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
          <p
            className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]"
            aria-label={t('themes.preview.aria.sectionHeading')}
          >
            {t('themes.preview.brandName')}
          </p>
          <p
            className="font-semibold text-[var(--color-text-primary)]"
            style={{ fontSize: 'var(--font-size-lg)' }}
          >
            {t(`themes.preview.pages.${selectedPage}`)}
          </p>
        </div>
        <div
          className="flex gap-2"
          style={{ gap: 'var(--spacing-sm)' }}
          aria-label={t('themes.preview.aria.avatarIndicators')}
        >
          <span
            className="h-8 w-8 rounded-full bg-[var(--color-primary)]/20"
            style={{ borderRadius: 'var(--border-radius-lg)' }}
            aria-hidden="true"
          />
          <span
            className="h-8 w-8 rounded-full bg-[var(--color-success)]/20"
            style={{ borderRadius: 'var(--border-radius-lg)' }}
            aria-hidden="true"
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
                    {t('themes.preview.feed.creator', { index: item })}
                  </p>
                  <p
                    className="text-[var(--color-text-secondary)]"
                    style={{ fontSize: 'var(--font-size-sm)' }}
                  >
                    {t('themes.preview.feed.meta')}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white"
                  style={{
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    borderRadius: 'var(--border-radius-2xl)',
                  }}
                  aria-label={t('themes.preview.feed.followAria', { index: item })}
                >
                  {t('themes.preview.feed.follow')}
                </button>
              </div>
              <p
                className="text-[var(--color-text-primary)]"
                style={{ marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}
              >
                {t('themes.preview.feed.quote')}
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
                  {t('themes.preview.feed.sampleTags.design')}
                </span>
                <span
                  className="rounded-full bg-[var(--color-surface-elevated)] text-xs text-[var(--color-text-secondary)]"
                  style={{
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    borderRadius: 'var(--border-radius-2xl)',
                  }}
                >
                  {t('themes.preview.feed.sampleTags.themes')}
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
            aria-label={t('themes.preview.aria.profileSummary')}
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
                  {t('themes.preview.profile.name')}
                </p>
                <p
                  className="text-[var(--color-text-secondary)]"
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  {t('themes.preview.profile.subtitle', {
                    formattedCount: formatNumber(12000, { notation: 'compact' }),
                  })}
                </p>
              </div>
              <button
                type="button"
                className="ml-auto rounded-full border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-primary)]"
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-md)',
                  borderRadius: 'var(--border-radius-2xl)',
                }}
                aria-label={t('themes.preview.profile.messageAria', {
                  name: t('themes.preview.profile.name'),
                })}
              >
                {t('themes.preview.profile.message')}
              </button>
            </div>
            <p
              className="text-[var(--color-text-secondary)]"
              style={{ marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}
            >
              {t('themes.preview.profile.bio')}
            </p>
          </div>
          <div
            className="grid md:grid-cols-3"
            style={{ gap: 'var(--spacing-md)' }}
            aria-label={t('themes.preview.aria.profileStats')}
          >
            {(['posts', 'themes', 'reactions'] as const).map((key) => (
              <div
                key={key}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center"
                style={{
                  padding: 'var(--spacing-md)',
                  borderRadius: 'var(--border-radius-xl)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {t(`themes.preview.profile.stats.${key}`)}
                </p>
                <p
                  className="font-bold text-[var(--color-text-primary)]"
                  style={{ fontSize: 'var(--font-size-lg)' }}
                >
                  {formatNumber(128)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPage === 'messages' && (
        <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]" style={{ gap: 'var(--spacing-md)' }}>
          <div className="flex flex-col" style={{ gap: 'var(--spacing-sm)' }}>
            {(['designSquad', 'productCrew', 'opsUpdates'] as const).map((roomKey, index) => (
              <div
                key={roomKey}
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
                  {t(`themes.preview.messages.rooms.${roomKey}`)}
                </p>
                <p
                  className="text-[var(--color-text-secondary)]"
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  {t('themes.preview.messages.unread', {
                    count: 2,
                    formattedCount: formatNumber(2),
                  })}
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
                  {t('themes.preview.messages.rooms.designSquad')}
                </p>
                <p
                  className="text-[var(--color-text-secondary)]"
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  {t('themes.preview.messages.onlineNow')}
                </p>
              </div>
            </div>
            <div
              className="flex flex-col py-4"
              style={{
                gap: 'var(--spacing-sm)',
                paddingTop: 'var(--spacing-md)',
                paddingBottom: 'var(--spacing-md)',
              }}
            >
              <p
                className="w-3/4 rounded-2xl rounded-bl-none border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)]"
                style={{
                  padding: 'var(--spacing-sm)',
                  fontSize: 'var(--font-size-base)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {t('themes.preview.messages.sample.incoming')}
              </p>
              <p
                className="ml-auto w-3/4 rounded-2xl rounded-br-none bg-[var(--color-primary)] text-white"
                style={{
                  padding: 'var(--spacing-sm)',
                  fontSize: 'var(--font-size-base)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {t('themes.preview.messages.sample.outgoing')}
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
                {t('themes.preview.messages.typePlaceholder')}
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
                {t(option.labelKey)}
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
                {t(option.labelKey)}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)]"
              onClick={() => setIsFullscreen((prev) => !prev)}
            >
              {isFullscreen
                ? t('themes.preview.actions.exitFullscreen')
                : t('themes.preview.actions.fullscreen')}
            </button>
          </div>
        </div>
      )}

      <div className={`relative ${isFullscreen ? 'z-50' : ''}`}>
        <div className={`${frameClasses} transition-all`}>{frameContent}</div>
      </div>
    </div>
  );

  if (!isFullscreen) {
    return previewWrapper;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-5xl">{previewWrapper}</div>
    </div>
  );
};

export default ThemePreview;
