import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageShell } from '../common/PageShell';

type AboutContentProps = {
  className?: string;
  variant?: 'page' | 'welcome';
  onNavigate?: () => void;
};

export function AboutContent({ className = '', variant = 'page', onNavigate }: AboutContentProps) {
  const { t } = useTranslation();
  const compact = variant === 'welcome';
  const linkClass =
    'inline-flex min-h-10 items-center text-sm font-medium text-[var(--color-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const features = [
    { key: 'communities', to: '/hubs' },
    { key: 'messaging', to: '/messages' },
    { key: 'hubDesigner', to: '/hubs' },
  ] as const;

  return (
    <div className={`${compact ? 'space-y-4' : 'space-y-6'} ${className}`}>
      <header className="space-y-3">
        <h1
          id={compact ? 'welcome-title' : undefined}
          className={`text-2xl font-bold text-[var(--color-text-primary)] ${compact ? '' : 'sm:text-3xl'}`}
        >
          {compact ? t('aboutPage.welcomeTitle') : t('common.brandName')}{' '}
          <span className="ml-2 text-sm font-normal text-[var(--color-text-secondary)]">
            {t('aboutPage.betaLabel')}
          </span>
        </h1>
        <p
          className={`text-sm ${compact ? 'leading-5' : 'leading-6'} text-[var(--color-text-secondary)]`}
        >
          {t('aboutPage.hero.description')}
        </p>
      </header>

      <section
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-primary)]/5 p-4 sm:p-5"
        aria-labelledby={compact ? 'welcome-omnirave' : 'about-omnirave'}
      >
        <h2
          id={compact ? 'welcome-omnirave' : 'about-omnirave'}
          className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]"
        >
          {t('aboutPage.omnirave.title')}
        </h2>
        <p
          className={`text-sm ${compact ? 'leading-5' : 'leading-6'} text-[var(--color-text-secondary)]`}
        >
          {t('aboutPage.omnirave.description')}
        </p>
        <Link to="/games/omnirave" onClick={onNavigate} className={`${linkClass} mt-2`}>
          {t('aboutPage.omnirave.link')}
        </Link>
      </section>

      <section aria-labelledby={compact ? 'welcome-features' : 'about-features'}>
        <h2
          id={compact ? 'welcome-features' : 'about-features'}
          className={`${compact ? 'sr-only' : 'mb-3 text-lg font-semibold'} text-[var(--color-text-primary)]`}
        >
          {t('aboutPage.availableToday.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ key, to }) => (
            <div key={key} className={key === 'hubDesigner' ? 'sm:col-span-2' : ''}>
              <h3 className="mb-1 text-sm font-semibold text-[var(--color-text-primary)]">
                {t(`aboutPage.features.${key}.title`)}
              </h3>
              <p
                className={`text-sm ${compact ? 'leading-5' : 'leading-6'} text-[var(--color-text-secondary)]`}
              >
                {t(`aboutPage.features.${key}.description`)}
              </p>
              {key !== 'hubDesigner' && (
                <Link to={to} onClick={onNavigate} className={linkClass}>
                  {t(`aboutPage.features.${key}.link`)}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--color-border)] pt-4">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
          {t('aboutPage.roadmap.title')}
        </h2>
        <p
          className={`text-sm ${compact ? 'leading-5' : 'leading-6'} text-[var(--color-text-secondary)]`}
        >
          {t('aboutPage.roadmap.dungeonMaster')}
        </p>
      </section>

      {!compact &&
        ['vision', 'messagingEncryption', 'customization'].map((key) => (
          <section key={key}>
            <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
              {t(`aboutPage.${key}.title`)}
            </h2>
            <p
              className={`text-sm ${compact ? 'leading-5' : 'leading-6'} text-[var(--color-text-secondary)]`}
            >
              {t(`aboutPage.${key}.${key === 'vision' ? 'description' : 'paragraph1'}`)}
            </p>
          </section>
        ))}

      <nav
        aria-label={t('aboutPage.footer.label')}
        className="flex flex-wrap gap-x-5 border-t border-[var(--color-border)] pt-3"
      >
        {compact && (
          <Link to="/about" onClick={onNavigate} className={linkClass}>
            {t('aboutPage.footer.about')}
          </Link>
        )}
        <Link to="/terms" onClick={onNavigate} className={linkClass}>
          {t('aboutPage.footer.termsOfService')}
        </Link>
        <Link to="/privacy" onClick={onNavigate} className={linkClass}>
          {t('aboutPage.footer.privacyPolicy')}
        </Link>
      </nav>
    </div>
  );
}

export default function AboutPageContent() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <AboutContent />
      </div>
    </PageShell>
  );
}
