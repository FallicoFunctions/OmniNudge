import { PageShell } from '../common/PageShell';
import { Trans, useTranslation } from 'react-i18next';

export function AboutContent({ className = '' }: { className?: string }) {
  const { t } = useTranslation();

  const visionItems = [
    'aboutPage.vision.items.socialMediaIntegration',
    'aboutPage.vision.items.officeSuite',
    'aboutPage.vision.items.gamingEcosystem',
    'aboutPage.vision.items.teamCommunication',
    'aboutPage.vision.items.financeCrypto',
    'aboutPage.vision.items.mobileDesktop',
  ] as const;

  const socialUpgradeItems = [
    'aboutPage.roadmap.social.items.friendsFollowers',
    'aboutPage.roadmap.social.items.multipleProfiles',
    'aboutPage.roadmap.social.items.karmaPointSystem',
    'aboutPage.roadmap.social.items.awardsBadges',
  ] as const;

  return (
    <div className={className}>
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-primary)]/5 rounded-2xl p-8 md:p-12 mb-12">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-display font-bold text-[var(--color-text-primary)] mb-4">
            {t('common.brandName')}
            <span className="ml-2 text-sm font-normal text-[var(--color-text-secondary)]">
              {t('aboutPage.betaLabel')}
            </span>
          </h1>
          <p className="text-h3 text-[var(--color-text-secondary)] mb-6">
            {t('aboutPage.hero.title')}
          </p>
          <p className="text-body text-[var(--color-text-secondary)]">
            {t('aboutPage.hero.description')}
          </p>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {/* What It Is Now */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--color-primary)]/10 mb-4">
            <svg
              className="w-6 h-6 text-[var(--color-primary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h2 className="text-h2 font-semibold text-[var(--color-text-primary)] mb-3">
            {t('aboutPage.availableToday.title')}
          </h2>
          <ul className="space-y-3 text-small text-[var(--color-text-secondary)]">
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('aboutPage.availableToday.items.createCommunities')}</span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('aboutPage.availableToday.items.browseReddit')}</span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('aboutPage.availableToday.items.encryptedMessaging')}</span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('aboutPage.availableToday.items.postAndComment')}</span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('aboutPage.availableToday.items.aiHubDesigner')}</span>
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <p className="text-xs text-orange-700 bg-orange-50 rounded-lg p-3">
              <Trans i18nKey="aboutPage.availableToday.note" components={{ strong: <strong /> }} />
            </p>
          </div>
        </div>

        {/* Vision */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-purple-100 mb-4">
            <svg
              className="w-6 h-6 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <h2 className="text-h2 font-semibold text-[var(--color-text-primary)] mb-3">
            {t('aboutPage.vision.title')}
          </h2>
          <p className="text-small text-[var(--color-text-secondary)] mb-4">
            {t('aboutPage.vision.description')}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-text-secondary)]">
            {visionItems.map((key) => (
              <div key={key} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                <span>{t(key)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Designer Highlight */}
      <div className="rounded-xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/10 via-[var(--color-primary)]/5 to-transparent p-6 md:p-8 mb-12">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg
              className="w-12 h-12 text-[var(--color-primary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 3v2.25m4.5-2.25v2.25M4.5 9.75h15M6.75 19.5h10.5A2.25 2.25 0 0019.5 17.25V8.25A2.25 2.25 0 0017.25 6H6.75A2.25 2.25 0 004.5 8.25v9A2.25 2.25 0 006.75 19.5zm1.5-6.75h7.5m-7.5 3h4.5"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-h2 font-semibold text-[var(--color-text-primary)] mb-3">
              {t('aboutPage.aiDesigner.title')}
            </h2>
            <p className="text-small text-[var(--color-text-secondary)] mb-3">
              {t('aboutPage.aiDesigner.paragraph1')}
            </p>
            <p className="text-small text-[var(--color-text-secondary)] mb-4">
              {t('aboutPage.aiDesigner.paragraph2')}
            </p>
            <p className="text-small text-[var(--color-text-secondary)]">
              {t('aboutPage.aiDesigner.paragraph3')}
            </p>
          </div>
        </div>
      </div>

      {/* Roadmap Section */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:p-8 mb-12">
        <h2 className="text-h2 font-semibold text-[var(--color-text-primary)] mb-6 flex items-center gap-2">
          <svg
            className="w-6 h-6 text-[var(--color-primary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
          {t('aboutPage.roadmap.title')}
        </h2>

        <div>
          <h3 className="text-small font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-600"></span>
            {t('aboutPage.roadmap.social.title')}
          </h3>
          <p className="text-small text-[var(--color-text-secondary)] mb-4">
            {t('aboutPage.roadmap.social.description')}
          </p>
          <ul className="space-y-2">
            {socialUpgradeItems.map((key) => (
              <li
                key={key}
                className="text-small text-[var(--color-text-secondary)] flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Customization Highlight */}
      <div className="rounded-xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent p-6 md:p-8 mb-12">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg
              className="w-12 h-12 text-[var(--color-primary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-h2 font-semibold text-[var(--color-text-primary)] mb-3">
              {t('aboutPage.customization.title')}
            </h2>
            <p className="text-small text-[var(--color-text-secondary)] mb-3">
              {t('aboutPage.customization.paragraph1')}
            </p>
            <p className="text-small text-[var(--color-text-secondary)]">
              {t('aboutPage.customization.paragraph2')}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Links */}
      <div className="flex flex-wrap gap-6 justify-center pt-8 border-t border-[var(--color-border)]">
        <a
          href="/terms"
          className="inline-flex items-center gap-2 text-small font-medium text-[var(--color-primary)] hover:underline"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {t('aboutPage.footer.termsOfService')}
        </a>
        <a
          href="/privacy"
          className="inline-flex items-center gap-2 text-small font-medium text-[var(--color-primary)] hover:underline"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          {t('aboutPage.footer.privacyPolicy')}
        </a>
      </div>
    </div>
  );
}

export default function AboutPageContent() {
  return (
    <PageShell>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <AboutContent />
      </div>
    </PageShell>
  );
}
